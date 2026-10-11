-- Confirmação ATÔMICA de uma cobrança Pix — corrige a lacuna de
-- concorrência da versão em TypeScript de PaymentChargeService.confirmPixCharge
-- (verificar receipt_id / criar receipt / atualizar charge como três
-- passos separados permitiria, em teoria, dois webhooks simultâneos lerem
-- receipt_id nulo ao mesmo tempo e gerarem baixa duplicada). Incremental
-- sobre 20261027100200_billing_message_logs.sql. NÃO aplicada ainda.
--
-- MESMO PADRÃO JÁ USADO em apply_client_credit (20261019100000_financeiro_credito_cliente.sql):
-- lock de linha (`for update`) dentro da transação da própria função,
-- SEM SECURITY DEFINER. Avaliado e descartado — não é necessário: quem já
-- tem permissão de confirmar uma cobrança (is_active_staff(), mesma RLS de
-- payment_charges/receivables/receivable_receipts) já tem permissão de
-- fazer exatamente as operações que esta função faz; não há privilégio
-- faltando que justifique rodar como owner da função. Um webhook real
-- futuro (fora do escopo desta fase) usaria a service_role key, que já
-- contorna RLS no nível do papel do Postgres — SECURITY DEFINER não
-- mudaria nada nesse cenário e só aumentaria a superfície de risco aqui.
--
-- IDEMPOTÊNCIA: a cobrança (payment_charges) é a ÚNICA fonte de verdade.
-- A função recebe SOMENTE o id da cobrança (p_charge_id) — nunca
-- client_id/receivable_id/amount do chamador; todos esses dados são lidos
-- da própria linha de payment_charges sob lock, nunca aceitos como
-- parâmetro. Isto não é um endpoint genérico de "dar baixa": só confirma
-- uma cobrança Pix já existente e pendente.

create or replace function public.confirm_payment_charge(
  p_charge_id uuid,
  p_received_at date default current_date,
  p_received_by uuid default null
)
returns table (
  receipt_id uuid,
  already_confirmed boolean,
  receivable_status text,
  receivable_balance numeric
)
language plpgsql
set search_path = public
as $$
declare
  v_charge public.payment_charges;
  v_receivable public.receivables;
  v_receipt_id uuid;
  v_received numeric;
  v_adjusted numeric;
  v_balance numeric;
  v_status text;
begin
  -- Lock da cobrança PRIMEIRO — nunca duas confirmações concorrentes leem
  -- receipt_id nulo ao mesmo tempo e criam duas baixas pra mesma cobrança.
  select * into v_charge from public.payment_charges where id = p_charge_id for update;
  if v_charge.id is null then
    raise exception 'Cobrança não encontrada: %', p_charge_id;
  end if;

  -- Idempotência: já confirmada antes (por esta ou por outra chamada
  -- concorrente que venceu a corrida pelo lock) — devolve o receipt
  -- existente, NUNCA cria um segundo.
  if v_charge.receipt_id is not null then
    select * into v_receivable from public.receivables where id = v_charge.receivable_id;
    select coalesce(sum(amount), 0) into v_received from public.receivable_receipts where receivable_id = v_charge.receivable_id and reversed_at is null;
    select coalesce(sum(amount), 0) into v_adjusted from public.receivable_adjustments where receivable_id = v_charge.receivable_id and reversed_at is null;
    return query select v_charge.receipt_id, true, v_receivable.status, (v_receivable.original_amount - v_received - v_adjusted);
    return;
  end if;

  if v_charge.status <> 'pending' then
    raise exception 'Esta cobrança não está aguardando pagamento (status atual: %).', v_charge.status;
  end if;

  -- Lock do título também — mesmo princípio de apply_client_credit (nunca
  -- recalcula saldo fora de um lock quando vai gravar em cima dele).
  select * into v_receivable from public.receivables where id = v_charge.receivable_id for update;
  if v_receivable.id is null then
    raise exception 'Título não encontrado: %', v_charge.receivable_id;
  end if;

  -- recorded_by é preenchido pelo trigger receivable_receipts_set_actor
  -- (auth.uid()), igual a qualquer outro recebimento — nunca setado aqui.
  -- reference recebe o txid/provider_charge_id da própria cobrança — nunca
  -- um valor vindo de fora desta função.
  insert into public.receivable_receipts (receivable_id, amount, received_at, payment_method, reference, received_by)
  values (v_charge.receivable_id, v_charge.amount, p_received_at, 'pix', v_charge.provider_charge_id, p_received_by)
  returning id into v_receipt_id;

  select coalesce(sum(amount), 0) into v_received from public.receivable_receipts where receivable_id = v_charge.receivable_id and reversed_at is null;
  select coalesce(sum(amount), 0) into v_adjusted from public.receivable_adjustments where receivable_id = v_charge.receivable_id and reversed_at is null;
  v_balance := v_receivable.original_amount - v_received - v_adjusted;
  v_status := case
    when v_receivable.status = 'cancelled' then 'cancelled'
    when v_balance <= 0 then 'paid'
    when v_balance < v_receivable.original_amount then 'partially_paid'
    else 'open'
  end;

  update public.receivables set status = v_status where id = v_charge.receivable_id;
  update public.payment_charges set status = 'paid', paid_at = now(), receipt_id = v_receipt_id where id = p_charge_id;

  return query select v_receipt_id, false, v_status, v_balance;
end;
$$;

comment on function public.confirm_payment_charge is
  'Confirmação atômica de uma cobrança Pix — lock (for update) na linha de payment_charges E na linha de receivables dentro da mesma transação; se receipt_id já estiver preenchido, devolve o receipt existente em vez de criar outro (idempotente sob concorrência: duas chamadas simultâneas nunca geram duas baixas). payment_charges é a única fonte de verdade — client_id/receivable_id/amount nunca são aceitos como parâmetro, só lidos da própria cobrança sob lock.';

grant execute on function public.confirm_payment_charge(uuid, date, uuid) to authenticated;
