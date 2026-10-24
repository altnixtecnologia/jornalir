-- Fechar INSERT direto dos ledgers. Todas as mutações financeiras seguem
-- RPCs com checagem de ação ou service_role após validação da Server Action.
drop policy if exists receivable_receipts_insert_staff on public.receivable_receipts;
drop policy if exists receivable_adjustments_insert_staff on public.receivable_adjustments;
drop policy if exists client_credits_insert_staff on public.client_credits;
drop policy if exists client_credits_update_staff on public.client_credits;
revoke insert on public.receivable_receipts,public.receivable_adjustments,public.client_credits
 from public,anon,authenticated;
revoke update on public.client_credits from public,anon,authenticated;
grant insert,update on public.receivable_receipts,public.receivable_adjustments,public.client_credits to service_role;

-- apply_client_credit era SECURITY INVOKER e dependia de INSERT direto
-- nos abatimentos. Transferir para SECURITY DEFINER com autorização
-- granular explícita, preservando row locks crédito→título.
create or replace function public.apply_client_credit(
  p_credit_id uuid,
  p_receivable_id uuid,
  p_requested_amount numeric,
  p_reason text,
  p_authorized_by uuid default null
)
returns table (
  applied_amount numeric,
  credit_remaining numeric,
  receivable_balance numeric,
  receivable_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.client_credits;
  v_receivable public.receivables;
  v_credit_applied numeric;
  v_credit_available numeric;
  v_receivable_received numeric;
  v_receivable_adjusted numeric;
  v_receivable_balance numeric;
  v_apply numeric;
  v_new_balance numeric;
  v_new_status text;
begin
  -- Privilégio de baixa manual ou de criação de título (automação de
  -- saldo anterior). Ambos exigem conta staff ativa e confirmada.
  if not (coalesce(public.staff_can_finance_action('creditos_aplicar'),false)
          or coalesce(public.staff_can_finance_action('titulos_criar'),false)) then
    raise exception 'Sem permissão para aplicar crédito.' using errcode='42501';
  end if;
  if p_requested_amount is null or p_requested_amount <= 0
     or p_requested_amount<>round(p_requested_amount,2)
     or p_requested_amount>9999999999.99
     or nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Informe um valor de aplicação válido.';
  end if;

  -- Lock do crédito PRIMEIRO — nunca duas transações concorrentes
  -- calculam o saldo disponível do MESMO crédito ao mesmo tempo.
  select * into v_credit from public.client_credits where id = p_credit_id for update;
  if v_credit.id is null then
    raise exception 'Crédito não encontrado: %', p_credit_id;
  end if;
  if v_credit.reversed_at is not null then
    raise exception 'Este crédito foi estornado e não pode ser aplicado.';
  end if;

  select coalesce(sum(amount), 0) into v_credit_applied
    from public.receivable_adjustments
    where credit_id = p_credit_id and reversed_at is null;
  v_credit_available := v_credit.original_amount - v_credit_applied;

  -- Lock do título também — mesma proteção pro lado do saldo do
  -- título (nunca aplica mais do que o saldo real dele).
  select * into v_receivable from public.receivables where id = p_receivable_id for update;
  if v_receivable.id is null then
    raise exception 'Título não encontrado: %', p_receivable_id;
  end if;
  if v_receivable.client_id <> v_credit.client_id then
    raise exception 'Este crédito pertence a outro cliente.';
  end if;
  -- Usuário que só pode criar títulos não ganha a capacidade de
  -- transferir crédito entre origens: isso exige creditos_aplicar.
  if not coalesce(public.staff_can_finance_action('creditos_aplicar'),false)
   and (v_credit.source_type not in ('subscription','institutional_contract')
     or v_credit.source_type is distinct from v_receivable.source_type
     or v_credit.subscription_id is distinct from v_receivable.subscription_id
     or v_credit.contract_id is distinct from v_receivable.contract_id) then
    raise exception 'Aplicação de crédito fora da mesma origem exige permissão adicional.' using errcode='42501';
  end if;
  if v_receivable.status = 'cancelled' then
    raise exception 'Não é possível aplicar crédito num título cancelado.';
  end if;

  select coalesce(sum(amount), 0) into v_receivable_received
    from public.receivable_receipts
    where receivable_id = p_receivable_id and reversed_at is null;
  select coalesce(sum(amount), 0) into v_receivable_adjusted
    from public.receivable_adjustments
    where receivable_id = p_receivable_id and reversed_at is null;
  v_receivable_balance := v_receivable.original_amount - v_receivable_received - v_receivable_adjusted;

  v_apply := least(p_requested_amount, v_credit_available, v_receivable_balance);

  if v_apply <= 0 then
    return query select 0::numeric, greatest(v_credit_available, 0), greatest(v_receivable_balance, 0), v_receivable.status;
    return;
  end if;

  -- recorded_by é preenchido pelo trigger receivable_adjustments_set_actor
  -- (auth.uid()), igual a qualquer outro abatimento — nunca setado aqui.
  insert into public.receivable_adjustments (receivable_id, amount, adjustment_type, reason, credit_id, authorized_by)
  values (p_receivable_id, v_apply, 'credit_applied', p_reason, p_credit_id, p_authorized_by);

  v_new_balance := v_receivable_balance - v_apply;
  v_new_status := case
    when v_receivable.status = 'cancelled' then 'cancelled'
    when v_new_balance <= 0 then 'paid'
    when v_new_balance < v_receivable.original_amount then 'partially_paid'
    else 'open'
  end;

  update public.receivables set status = v_new_status where id = p_receivable_id;

  return query select v_apply, (v_credit_available - v_apply), v_new_balance, v_new_status;
end;
$$;

revoke all on function public.apply_client_credit(uuid,uuid,numeric,text,uuid) from public,anon;
grant execute on function public.apply_client_credit(uuid,uuid,numeric,text,uuid) to authenticated;
comment on function public.apply_client_credit(uuid,uuid,numeric,text,uuid) is
 'Aplicação transacional com permissão creditos_aplicar; criadores de título só usam saldo da mesma origem. Crédito e título sob locks, sem INSERT direto por usuário.';

-- Crédito não pode ser estornado se tiver aplicação ativa ou se nasceu
-- de pagamento Asaas que exige conciliação externa.
create function public.reverse_client_credit_safe(p_credit_id uuid,p_reason text)
returns table(credit_id uuid,already_reversed boolean)
language plpgsql security definer set search_path='' as $reverse$
declare
 c public.client_credits;
 used_amount numeric;
 old boolean;
begin
 if not coalesce(public.staff_can_finance_action('recebimentos_estornar'),false)
 then raise exception 'Sem permissão para estornar crédito.' using errcode='42501'; end if;
 if p_credit_id is null or nullif(btrim(coalesce(p_reason,'')),'') is null
 then raise exception 'Crédito e motivo do estorno são obrigatórios.' using errcode='22023'; end if;
 select * into c from public.client_credits where id=p_credit_id for update;
 if not found then raise exception 'Crédito inexistente.' using errcode='22023'; end if;
 if c.origin_payment_charge_id is not null then
   raise exception 'Crédito vinculado ao Asaas: conciliação externa necessária.' using errcode='22023';
 end if;
 select coalesce(sum(a.amount),0) into used_amount
  from public.receivable_adjustments a
  where a.credit_id=c.id and a.reversed_at is null;
 if used_amount>0 then
  raise exception 'Crédito já aplicado. Reverta primeiro as aplicações vinculadas.' using errcode='22023';
 end if;
 old:=c.reversed_at is not null;
 if old then
  if c.reversed_by is distinct from auth.uid() or c.reversal_reason is distinct from btrim(p_reason)
  then raise exception 'Crédito já estornado. Consulte o histórico.' using errcode='22023'; end if;
 else
  update public.client_credits set
   reversed_at=clock_timestamp(),reversed_by=auth.uid(),reversal_reason=btrim(p_reason)
  where id=c.id and reversed_at is null;
 end if;
 return query select c.id,old;
end;
$reverse$;
revoke all on function public.reverse_client_credit_safe(uuid,text) from public,anon;
grant execute on function public.reverse_client_credit_safe(uuid,text) to authenticated;
comment on function public.reverse_client_credit_safe(uuid,text) is
 'Estorno de crédito com permissão de estorno, bloqueio de aplicações ativas e origem Asaas; update idempotente sob lock.';

