-- Pagamento por cartão de crédito (fatura hospedada do Asaas) — ALT-FIN-002.
-- Preparada localmente, NÃO aplicada. Aditiva: uma cobrança pendente por título continua garantida pelo
-- índice único existente (payment_charges_one_pending_per_receivable), agora para QUALQUER forma.
-- Nenhum dado de cartão é guardado: só a URL da fatura hospedada, parcelas e marcos do provedor.
--
-- Contabilidade (modelo existente preservado): bruto = payment_charges.amount e recibo; líquido informado
-- pelo provedor na liquidação fica em gateway_net_amount (nunca altera saldo). O recibo é gerado pela MESMA
-- confirm_payment_charge (idempotente por status), agora com a forma real (credit_card).

alter table public.payment_charges
  add column if not exists payment_method text not null default 'pix',
  add column if not exists invoice_url text,
  add column if not exists installment_count integer,
  add column if not exists provider_installment_id text,
  add column if not exists provider_confirmed_at timestamptz,
  add column if not exists provider_settled_at timestamptz,
  add column if not exists provider_rejected_at timestamptz,
  add column if not exists gateway_net_amount numeric(12, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_charges_method_valid' and conrelid = 'public.payment_charges'::regclass) then
    alter table public.payment_charges
      add constraint payment_charges_method_valid check (payment_method in ('pix', 'credit_card')),
      add constraint payment_charges_installments_valid check (installment_count is null or installment_count between 1 and 21),
      add constraint payment_charges_method_shape check (
        (payment_method = 'pix' and invoice_url is null and installment_count is null)
        or (payment_method = 'credit_card' and pix_copy_paste is null)
      );
  end if;
end $$;

create index if not exists payment_charges_provider_installment_idx
  on public.payment_charges (provider_installment_id) where provider_installment_id is not null;

comment on column public.payment_charges.invoice_url is
  'URL da fatura hospedada do provedor (cartão). Validada contra origens confiáveis na aplicação. Nenhum dado de cartão é armazenado.';
comment on column public.payment_charges.provider_confirmed_at is
  'Provedor confirmou o pagamento (cartão capturado), valor ainda não liquidado.';

-- Configuração de parcelamento do cartão (padrão: à vista). Sem juros nem taxas inventados: o total cobrado do
-- cliente é sempre o saldo do título; o provedor apenas divide o total em parcelas.
alter table public.billing_provider_settings
  add column if not exists credit_card_max_installments integer not null default 1 check (credit_card_max_installments between 1 and 12),
  add column if not exists credit_card_min_installment_amount numeric(12, 2) not null default 5.00 check (credit_card_min_installment_amount >= 5);

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
    values (v_charge.receivable_id, v_apply, p_received_at,
      case when v_charge.payment_method = 'credit_card' then 'credit_card' else 'pix' end,
      v_charge.provider_charge_id, p_received_by)
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
      'Excedente de cobrança ' || case when v_charge.payment_method = 'credit_card' then 'de cartão' else 'Pix' end || ' confirmada: cobrança de R$ ' || v_charge.amount::text
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
  'Confirmação atômica de cobrança (Pix ou cartão) — lock em payment_charges E receivables na mesma transação. Idempotência pelo status da cobrança. O recibo registra a forma real (pix ou credit_card).';
