-- Pagamento em composição (vários títulos da mesma assinatura/contrato).
-- Recebimentos, status e crédito excedente numa única transação.
-- Nunca altera a baixa Asaas (confirm_payment_charge) nem a
-- aplicação de créditos (apply_client_credit) já transacionais.
create table public.manual_composition_operations (
  operation_id uuid primary key,
  receivable_ids uuid[] not null,
  operation_data jsonb not null,
  allocations jsonb not null default '[]'::jsonb,
  applied_amount numeric(12,2) not null,
  credit_amount numeric(12,2) not null,
  credit_id uuid references public.client_credits(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.manual_composition_operations enable row level security;
revoke all on public.manual_composition_operations from public, anon, authenticated;
grant select on public.manual_composition_operations to authenticated;
grant select,insert on public.manual_composition_operations to service_role;
create policy manual_composition_operations_read on public.manual_composition_operations
  for select to authenticated using (
    public.staff_can_see_module('financeiro') and
    (created_by=(select auth.uid()) or public.is_active_admin_or_owner())
  );
comment on table public.manual_composition_operations is
 'Registro imutável e idempotente: um único pagamento pode liquidar vários títulos da mesma origem, sempre do mais antigo ao atual; recibos e crédito excedente na mesma transação.';

create function public.record_manual_composition_payment(
  p_operation_id uuid,
  p_receivable_ids uuid[],
  p_amount numeric,
  p_received_at date,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_received_by uuid
)
returns table(
  applied_amount numeric,
  credit_amount numeric,
  credit_id uuid,
  allocations jsonb
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_count integer;
  v_ord integer;
  v_title public.receivables;
  v_target public.receivables;
  v_existing public.manual_composition_operations;
  v_snapshot jsonb;
  v_balance numeric;
  v_received numeric;
  v_adjusted numeric;
  v_applied numeric;
  v_remaining numeric;
  v_total_applied numeric := 0;
  v_credit_id uuid;
  v_receipt_id uuid;
  v_allocations jsonb := '[]'::jsonb;
  v_prior_due date;
  v_missing integer;
  v_status text;
begin
  if not coalesce(public.staff_can_finance_action('recebimentos_baixar'), false) then
    raise exception 'Sem permissão para receber títulos.' using errcode='42501';
  end if;
  v_count := coalesce(array_length(p_receivable_ids,1),0);
  if p_operation_id is null or v_count<2 or v_count>50
    or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
    or p_amount>9999999999.99 or p_received_at is null then
    raise exception 'Informe operação, títulos e valor de pagamento válidos.' using errcode='22023';
  end if;
  if (select count(distinct x.id) from unnest(p_receivable_ids) as x(id))<>v_count
    or exists(select 1 from unnest(p_receivable_ids) as x(id) where x.id is null)
  then
    raise exception 'Títulos repetidos ou inválidos não são permitidos.' using errcode='22023';
  end if;
  v_snapshot:=jsonb_build_object(
    'receivable_ids',to_jsonb(p_receivable_ids),'amount',p_amount,
    'received_at',p_received_at,'method',p_payment_method,
    'reference',p_reference,'notes',p_notes,
    'received_by',p_received_by,'actor',auth.uid()
  );

  -- Ordem de LOCK canônica (UUID) evita deadlock entre duas composições
  -- enviadas com conjuntos parcialmente sobrepostos. A distribuição
  -- do pagamento usa depois a ordem financeira explícita do formulário.
  for v_id in select distinct x.id from unnest(p_receivable_ids) as x(id) order by x.id
  loop
    select * into v_title from public.receivables where id=v_id for update;
    if not found then raise exception 'Um dos títulos não existe.'; end if;
  end loop;

  -- Retry após timeout: retornar SOMENTE o resultado idêntico. Uma
  -- segunda chamada de outro usuário ou com alteração de valor/lista
  -- é rejeitada sem inserir outro recebimento.
  select * into v_existing from public.manual_composition_operations
    where operation_id=p_operation_id;
  if found then
    if v_existing.operation_data is distinct from v_snapshot
      or v_existing.receivable_ids is distinct from p_receivable_ids then
      raise exception 'Identificador já usado em outra operação. Reabra o formulário.' using errcode='23505';
    end if;
    return query select v_existing.applied_amount,v_existing.credit_amount,
      v_existing.credit_id,v_existing.allocations;
    return;
  end if;

  -- O título atual é o último no formulário; os anteriores vêm
  -- ordenados pelo vencimento. Nunca combinar clientes ou origens.
  select * into v_target from public.receivables where id=p_receivable_ids[v_count];
  if v_target.status='cancelled'
    or v_target.source_type not in ('subscription','institutional_contract')
    or (v_target.source_type='subscription' and v_target.subscription_id is null)
    or (v_target.source_type='institutional_contract' and v_target.contract_id is null)
  then
    raise exception 'Composição exige título ativo de assinatura ou contrato identificável.' using errcode='22023';
  end if;

  for v_ord in 1..v_count
  loop
    select * into v_title from public.receivables where id=p_receivable_ids[v_ord];
    if v_title.client_id is distinct from v_target.client_id
      or v_title.source_type is distinct from v_target.source_type
      or v_title.subscription_id is distinct from v_target.subscription_id
      or v_title.contract_id is distinct from v_target.contract_id
      or v_title.status='cancelled' then
      raise exception 'Composição contém títulos de clientes/origens diferentes ou cancelados.' using errcode='22023';
    end if;
    if v_ord < v_count then
      if v_title.status not in ('open','partially_paid') then
        raise exception 'Um título anterior deixou de estar em aberto. Atualize a página.' using errcode='22023';
      end if;
      if v_prior_due is not null and v_title.due_date<v_prior_due then
        raise exception 'Títulos anteriores fora da ordem de vencimento.' using errcode='22023';
      end if;
      v_prior_due:=v_title.due_date;
    end if;
  end loop;
  -- Não permitir omitir débitos anteriores da mesma origem e registrar
  -- apenas os mais recentes, manipulando a lista no navegador.
  select count(*) into v_missing from public.receivables r
    where r.client_id=v_target.client_id
      and r.source_type=v_target.source_type
      and r.subscription_id is not distinct from v_target.subscription_id
      and r.contract_id is not distinct from v_target.contract_id
      and r.status in ('open','partially_paid')
      and r.id<>v_target.id and not (r.id=any(p_receivable_ids));
  if v_missing>0 then
    raise exception 'Existem títulos da mesma origem fora da composição. Atualize a página.' using errcode='22023';
  end if;

  v_remaining:=p_amount;
  for v_ord in 1..v_count
  loop
    exit when v_remaining<=0;
    select * into v_title from public.receivables where id=p_receivable_ids[v_ord];
    select coalesce(sum(amount),0) into v_received
      from public.receivable_receipts
      where receivable_id=v_title.id and reversed_at is null;
    select coalesce(sum(amount),0) into v_adjusted
      from public.receivable_adjustments
      where receivable_id=v_title.id and reversed_at is null;
    v_balance:=greatest(v_title.original_amount-v_received-v_adjusted,0);
    v_applied:=least(v_remaining,v_balance);
    if v_applied>0 then
      insert into public.receivable_receipts (
        receivable_id,amount,received_at,payment_method,reference,notes,received_by
      ) values (
        v_title.id,v_applied,p_received_at,p_payment_method,p_reference,p_notes,p_received_by
      ) returning id into v_receipt_id;
      v_allocations:=v_allocations || jsonb_build_array(jsonb_build_object(
        'receivable_id',v_title.id,'receipt_id',v_receipt_id,'amount',v_applied
      ));
      v_remaining:=v_remaining-v_applied;
      v_total_applied:=v_total_applied+v_applied;
      v_status:=case
        when v_balance-v_applied<=0 then 'paid'
        when v_balance-v_applied<v_title.original_amount then 'partially_paid'
        else 'open' end;
      update public.receivables set status=v_status where id=v_title.id;
    end if;
  end loop;

  if v_remaining>0 then
    insert into public.client_credits (
      client_id,source_type,subscription_id,contract_id,
      origin_receivable_id,origin_receipt_id,original_amount,reason,created_by
    ) values (
      v_target.client_id,v_target.source_type,v_target.subscription_id,v_target.contract_id,
      coalesce((v_allocations->-1->>'receivable_id')::uuid,v_target.id),
      (v_allocations->-1->>'receipt_id')::uuid,v_remaining,
      'Excedente de recebimento da composição de títulos',auth.uid()
    ) returning id into v_credit_id;
  end if;

  insert into public.manual_composition_operations(
    operation_id,receivable_ids,operation_data,allocations,
    applied_amount,credit_amount,credit_id,created_by
  ) values(
    p_operation_id,p_receivable_ids,v_snapshot,v_allocations,
    v_total_applied,v_remaining,v_credit_id,auth.uid()
  );
  return query select v_total_applied,v_remaining,v_credit_id,v_allocations;
end;
$fn$;
revoke all on function public.record_manual_composition_payment(
  uuid,uuid[],numeric,date,text,text,text,uuid
) from public,anon;
grant execute on function public.record_manual_composition_payment(
  uuid,uuid[],numeric,date,text,text,text,uuid
) to authenticated;
comment on function public.record_manual_composition_payment is
 'Uma transação para pagamento distribuído por títulos em ordem controlada; locks determinísticos, valor máximo por saldo e crédito do excedente; retry com operação UUID estável.';
