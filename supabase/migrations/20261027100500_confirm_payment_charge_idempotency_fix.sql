-- Corrige a idempotência de confirm_payment_charge para o caso em que o
-- saldo do título já era ZERO no momento da confirmação — nesse caso
-- receipt_id fica legitimamente NULL (nenhum receipt é criado, o valor
-- inteiro vira crédito), e a versão anterior usava `receipt_id is not
-- null` como marcador de "já confirmada". Uma segunda chamada desse
-- cenário via receipt_id NULL caía no fluxo "ainda não confirmada", via
-- status, e disparava a exceção "não está aguardando pagamento" em vez de
-- devolver o resultado já processado. Incremental sobre
-- 20261027100400_payment_charge_overpayment_credit.sql. NÃO aplicada
-- ainda.
--
-- CORREÇÃO: a fonte de verdade de "já confirmada" passa a ser
-- `payment_charges.status = 'paid'` (sob o mesmo row lock), nunca
-- `receipt_id is not null` isoladamente — receipt_id continua útil (é
-- devolvido no resultado, pode genuinamente ser NULL), mas não é mais o
-- marcador de idempotência. A UNIQUE parcial em
-- client_credits.origin_payment_charge_id (de 20261027100400) continua
-- como segunda garantia no banco contra crédito duplicado, mesmo sob
-- concorrência.
--
-- Mesmo `returns table` de antes (6 colunas) — `create or replace` é
-- suficiente aqui, sem precisar de DROP FUNCTION.

create or replace function public.confirm_payment_charge(
  p_charge_id uuid,
  p_received_at date default current_date,
  p_received_by uuid default null
)
returns table (
  receipt_id uuid,
  already_confirmed boolean,
  receivable_status text,
  receivable_balance numeric,
  overpayment_amount numeric,
  credit_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_charge public.payment_charges;
  v_receivable public.receivables;
  v_receipt_id uuid;
  v_credit_id uuid;
  v_received numeric;
  v_adjusted numeric;
  v_balance_before numeric;
  v_apply numeric;
  v_overpayment numeric;
  v_new_balance numeric;
  v_status text;
begin
  -- Lock da cobrança PRIMEIRO — nunca duas confirmações concorrentes
  -- processam a mesma cobrança ao mesmo tempo.
  select * into v_charge from public.payment_charges where id = p_charge_id for update;
  if v_charge.id is null then
    raise exception 'Cobrança não encontrada: %', p_charge_id;
  end if;

  -- IDEMPOTÊNCIA: a fonte de verdade é o STATUS da cobrança, nunca
  -- receipt_id isolado — quando o saldo já era zero na confirmação
  -- original, nenhum receipt foi criado (receipt_id fica legitimamente
  -- NULL) mas a cobrança já está 'paid' e o excedente inteiro já virou
  -- crédito. Cobre os três casos possíveis de reprocessamento: receipt
  -- sem crédito, receipt com crédito, e crédito sem receipt.
  if v_charge.status = 'paid' then
    select * into v_receivable from public.receivables where id = v_charge.receivable_id;
    select coalesce(sum(amount), 0) into v_received from public.receivable_receipts where receivable_id = v_charge.receivable_id and reversed_at is null;
    select coalesce(sum(amount), 0) into v_adjusted from public.receivable_adjustments where receivable_id = v_charge.receivable_id and reversed_at is null;
    select id, original_amount into v_credit_id, v_overpayment from public.client_credits where origin_payment_charge_id = p_charge_id;
    return query select v_charge.receipt_id, true, v_receivable.status, (v_receivable.original_amount - v_received - v_adjusted), coalesce(v_overpayment, 0), v_credit_id;
    return;
  end if;

  if v_charge.status <> 'pending' then
    raise exception 'Esta cobrança não está aguardando pagamento (status atual: %).', v_charge.status;
  end if;

  -- Lock do título também — mesmo princípio de apply_client_credit.
  select * into v_receivable from public.receivables where id = v_charge.receivable_id for update;
  if v_receivable.id is null then
    raise exception 'Título não encontrado: %', v_charge.receivable_id;
  end if;

  select coalesce(sum(amount), 0) into v_received from public.receivable_receipts where receivable_id = v_charge.receivable_id and reversed_at is null;
  select coalesce(sum(amount), 0) into v_adjusted from public.receivable_adjustments where receivable_id = v_charge.receivable_id and reversed_at is null;
  v_balance_before := v_receivable.original_amount - v_received - v_adjusted;

  -- NUNCA cria um receipt maior que o saldo ATUAL do título. Quando o
  -- saldo já é zero (ou negativo, não deveria ocorrer mas é defensivo),
  -- v_apply fica 0 e NENHUM receipt é criado — todo o valor vira crédito
  -- (item 1 desta revisão).
  v_apply := greatest(least(v_charge.amount, v_balance_before), 0);
  v_overpayment := v_charge.amount - v_apply;

  if v_apply > 0 then
    -- recorded_by é preenchido pelo trigger receivable_receipts_set_actor
    -- (auth.uid()) — nunca setado aqui. reference recebe o
    -- provider_charge_id da própria cobrança.
    insert into public.receivable_receipts (receivable_id, amount, received_at, payment_method, reference, received_by)
    values (v_charge.receivable_id, v_apply, p_received_at, 'pix', v_charge.provider_charge_id, p_received_by)
    returning id into v_receipt_id;
  else
    v_receipt_id := null;
  end if;

  if v_overpayment > 0 then
    -- subscription_id/contract_id copiados do PRÓPRIO recebível — nunca
    -- uma regra de origem paralela: isto é exatamente o que
    -- creditMatchesReceivableOrigin (ver @ir/types) exige pra este
    -- crédito poder ser aplicado depois segundo as mesmas regras já
    -- existentes de "mesma origem" (nunca cruza assinatura/contrato
    -- diferentes).
    insert into public.client_credits (
      client_id, source_type, subscription_id, contract_id,
      origin_receivable_id, origin_receipt_id, origin_payment_charge_id,
      original_amount, reason, created_by
    ) values (
      v_charge.client_id, v_receivable.source_type, v_receivable.subscription_id, v_receivable.contract_id,
      v_charge.receivable_id, v_receipt_id, p_charge_id,
      v_overpayment,
      'Excedente de cobrança Pix confirmada: cobrança de R$ ' || v_charge.amount::text
        || ' sobre saldo de R$ ' || v_balance_before::text || ' no título ' || v_receivable.internal_reference || '.',
      p_received_by
    )
    returning id into v_credit_id;
  end if;

  select coalesce(sum(amount), 0) into v_received from public.receivable_receipts where receivable_id = v_charge.receivable_id and reversed_at is null;
  select coalesce(sum(amount), 0) into v_adjusted from public.receivable_adjustments where receivable_id = v_charge.receivable_id and reversed_at is null;
  v_new_balance := v_receivable.original_amount - v_received - v_adjusted;
  v_status := case
    when v_receivable.status = 'cancelled' then 'cancelled'
    when v_new_balance <= 0 then 'paid'
    when v_new_balance < v_receivable.original_amount then 'partially_paid'
    else 'open'
  end;

  update public.receivables set status = v_status where id = v_charge.receivable_id;
  update public.payment_charges set status = 'paid', paid_at = now(), receipt_id = v_receipt_id where id = p_charge_id;

  return query select v_receipt_id, false, v_status, v_new_balance, v_overpayment, v_credit_id;
end;
$$;

comment on function public.confirm_payment_charge is
  'Confirmação atômica de uma cobrança Pix — lock (for update) em payment_charges E receivables na mesma transação. IDEMPOTÊNCIA pelo STATUS da cobrança (payment_charges.status = ''paid''), nunca por receipt_id isolado: quando o saldo já era zero na confirmação, nenhum receipt é criado (receipt_id fica NULL legitimamente) mas a cobrança já fica paid com o valor inteiro em crédito — uma segunda chamada reconhece isso pelo status e devolve o resultado já existente (localizado via client_credits.origin_payment_charge_id), nunca cria receipt/crédito duplicado. NUNCA cria um receipt maior que o saldo atual do título: o excedente vira client_credits copiando subscription_id/contract_id do próprio recebível (mesmas regras de "mesma origem" já existentes, nunca uma regra paralela). payment_charges.amount nunca é alterado — continua representando o valor total efetivamente recebido do provedor.';

grant execute on function public.confirm_payment_charge(uuid, date, uuid) to authenticated;
