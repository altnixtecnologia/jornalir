-- Abatimentos DESCONTO: operação transacional e idempotente.
-- "Quitar com diferença" e "crédito aplicado" usam fluxos e permissões
-- específicos; o operador com ajustes_criar não pode usá-los por aqui.
create table public.manual_adjustment_operations (
  operation_id uuid primary key,
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  operation_data jsonb not null,
  adjustment_id uuid not null references public.receivable_adjustments(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.manual_adjustment_operations enable row level security;
revoke all on public.manual_adjustment_operations from public,anon,authenticated;
grant select on public.manual_adjustment_operations to authenticated;
grant select,insert on public.manual_adjustment_operations to service_role;
create policy manual_adjustment_operations_read on public.manual_adjustment_operations
  for select to authenticated using (
    public.staff_can_see_module('financeiro') and
    (created_by=(select auth.uid()) or public.is_active_admin_or_owner())
  );
comment on table public.manual_adjustment_operations is
 'Registro imutável de abatimentos em título: no máximo um lançamento por UUID do formulário, com lock de título, e referência ao histórico original.';

create function public.record_manual_receivable_adjustment(
  p_operation_id uuid,p_receivable_id uuid,p_amount numeric,p_adjustment_type text,
  p_reason text,p_authorized_by uuid,p_notes text
)
returns table(adjustment_id uuid,receivable_balance numeric,receivable_status text)
language plpgsql security definer set search_path=public
as $fn$
declare
  v_title public.receivables;
  v_existing public.manual_adjustment_operations;
  v_snapshot jsonb;
  v_received numeric;
  v_adjusted numeric;
  v_balance numeric;
  v_new_balance numeric;
  v_new_status text;
  v_adjustment_id uuid;
begin
  if not coalesce(public.staff_can_finance_action('ajustes_criar'),false) then
    raise exception 'Sem permissão para criar abatimentos.' using errcode='42501';
  end if;
  if p_operation_id is null or p_receivable_id is null or
     p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
     or p_amount>9999999999.99 or p_adjustment_type is distinct from 'discount'
     or nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Informe desconto, valor e motivo válidos.' using errcode='22023';
  end if;
  v_snapshot:=jsonb_build_object(
    'receivable',p_receivable_id,'amount',p_amount,
    'type',p_adjustment_type,'reason',btrim(p_reason),
    'authorized_by',p_authorized_by,'notes',p_notes,'actor',auth.uid()
  );
  select * into v_title from public.receivables
    where id=p_receivable_id for update;
  if not found then raise exception 'Título não encontrado.'; end if;
  select * into v_existing from public.manual_adjustment_operations
    where operation_id=p_operation_id;
  if found then
    if v_existing.receivable_id is distinct from p_receivable_id
       or v_existing.operation_data is distinct from v_snapshot then
      raise exception 'Identificador já usado. Reabra o formulário.' using errcode='23505';
    end if;
    select coalesce(sum(amount),0) into v_received from public.receivable_receipts
      where receivable_id=p_receivable_id and reversed_at is null;
    select coalesce(sum(amount),0) into v_adjusted from public.receivable_adjustments
      where receivable_id=p_receivable_id and reversed_at is null;
    return query select v_existing.adjustment_id,
       (v_title.original_amount-v_received-v_adjusted),v_title.status;
    return;
  end if;
  if v_title.status='cancelled' then
    raise exception 'Título cancelado não aceita abatimento.' using errcode='22023';
  end if;
  select coalesce(sum(amount),0) into v_received from public.receivable_receipts
    where receivable_id=p_receivable_id and reversed_at is null;
  select coalesce(sum(amount),0) into v_adjusted from public.receivable_adjustments
    where receivable_id=p_receivable_id and reversed_at is null;
  v_balance:=v_title.original_amount-v_received-v_adjusted;
  if v_balance<=0 or p_amount>v_balance then
    raise exception 'Abatimento maior que o saldo atual. Atualize a página.' using errcode='22023';
  end if;
  insert into public.receivable_adjustments(
    receivable_id,amount,adjustment_type,reason,authorized_by,notes
  ) values(
    p_receivable_id,p_amount,'discount',btrim(p_reason),p_authorized_by,p_notes
  ) returning id into v_adjustment_id;
  v_new_balance:=v_balance-p_amount;
  v_new_status:=case when v_new_balance<=0 then 'paid'
    when v_new_balance<v_title.original_amount then 'partially_paid'
    else 'open' end;
  update public.receivables set status=v_new_status where id=p_receivable_id;
  insert into public.manual_adjustment_operations(
    operation_id,receivable_id,operation_data,adjustment_id,created_by
  ) values (p_operation_id,p_receivable_id,v_snapshot,v_adjustment_id,auth.uid());
  return query select v_adjustment_id,v_new_balance,v_new_status;
end;
$fn$;
revoke all on function public.record_manual_receivable_adjustment(
  uuid,uuid,numeric,text,text,uuid,text
) from public,anon;
grant execute on function public.record_manual_receivable_adjustment(
  uuid,uuid,numeric,text,text,uuid,text
) to authenticated;
comment on function public.record_manual_receivable_adjustment is
 'Desconto idempotente com status e saldo calculados sob lock do título; quitação com diferença exige fluxo distinto.';
