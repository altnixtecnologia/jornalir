-- Trata o caso em que o saldo do recebível MUDOU entre a criação da
-- cobrança Pix e a confirmação (ex.: pagamento manual registrado nesse
-- intervalo) — a confirmação NUNCA pode criar um receipt maior que o
-- saldo atual. Incremental sobre 20261027100300_confirm_payment_charge_rpc.sql.
-- NÃO aplicada ainda.
--
-- EXEMPLO (cenário da tarefa):
--   título R$ 500,00 -> Pix pendente de R$ 500,00 criado -> antes da
--   confirmação, pagamento manual em dinheiro de R$ 200,00 é registrado
--   (saldo cai pra R$ 300,00) -> confirmação do Pix de R$ 500,00 chega.
-- Resultado: receipt de R$ 300,00 (nunca R$ 500,00 sobre um saldo de
-- R$ 300,00), título quitado, excedente de R$ 200,00 vira client_credits
-- (rastreável até esta cobrança), e payment_charges.amount continua
-- registrando os R$ 500,00 efetivamente recebidos do provedor — nenhuma
-- informação é perdida.
--
-- DECISÃO: reaproveita public.client_credits (já existente e funcional,
-- auditado antes desta migration) — NÃO foi criada uma segunda estrutura
-- de crédito. client_credits já suporta isso com segurança: cada crédito
-- é uma linha própria e imutável (nunca um saldo mutável), com
-- subscription_id/contract_id pra "mesma origem" na aplicação automática
-- futura, e um lugar natural pra rastreabilidade (origin_receivable_id/
-- origin_receipt_id). Faltava só um identificador determinístico ligando
-- o crédito à cobrança que o originou — adicionado abaixo
-- (origin_payment_charge_id), com unicidade garantida no banco (nunca
-- "procurar valor parecido" pra decidir se o crédito já existe).

alter table public.client_credits
  add column origin_payment_charge_id uuid references public.payment_charges (id);

comment on column public.client_credits.origin_payment_charge_id is
  'Preenchido quando o crédito surgiu do excedente de uma cobrança Pix confirmada acima do saldo do título (ver confirm_payment_charge). Chave de idempotência: no máximo um crédito por cobrança, garantido pelo índice único parcial abaixo — nunca depende de "procurar valor parecido".';

-- Idempotência determinística do crédito por excedente (item 8 da
-- tarefa) — nunca duas linhas de crédito pra mesma cobrança, mesmo sob
-- concorrência (reforça no banco o que o lock da RPC já garante).
create unique index client_credits_origin_payment_charge_id_unique
  on public.client_credits (origin_payment_charge_id)
  where origin_payment_charge_id is not null;

-- Precisa recriar com a lista de colunas de retorno diferente (Postgres
-- não permite CREATE OR REPLACE mudar o `returns table` de uma função
-- existente) — por isso DROP + CREATE, não apenas `or replace`. Mesma
-- função, mesmo nome/assinatura de parâmetros de entrada
-- (confirm_payment_charge(uuid, date, uuid)), criada em
-- 20261027100300_confirm_payment_charge_rpc.sql.
drop function if exists public.confirm_payment_charge(uuid, date, uuid);

create function public.confirm_payment_charge(
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
  -- Lock da cobrança PRIMEIRO — mesmo princípio da versão anterior:
  -- nunca duas confirmações concorrentes leem receipt_id nulo ao mesmo
  -- tempo e criam duas baixas (ou dois créditos) pra mesma cobrança.
  select * into v_charge from public.payment_charges where id = p_charge_id for update;
  if v_charge.id is null then
    raise exception 'Cobrança não encontrada: %', p_charge_id;
  end if;

  -- Idempotência: já confirmada antes — devolve o receipt/crédito
  -- existentes, NUNCA cria outro.
  if v_charge.receipt_id is not null then
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

  -- NUNCA cria um receipt maior que o saldo ATUAL do título — se o saldo
  -- mudou desde que a cobrança foi criada (ex.: pagamento manual nesse
  -- meio-tempo), só aplica até o saldo; o excedente vira crédito (abaixo).
  v_apply := greatest(least(v_charge.amount, v_balance_before), 0);
  v_overpayment := v_charge.amount - v_apply;

  if v_apply > 0 then
    -- recorded_by é preenchido pelo trigger receivable_receipts_set_actor
    -- (auth.uid()), igual a qualquer outro recebimento — nunca setado
    -- aqui. reference recebe o txid/provider_charge_id da própria
    -- cobrança — nunca um valor vindo de fora desta função.
    insert into public.receivable_receipts (receivable_id, amount, received_at, payment_method, reference, received_by)
    values (v_charge.receivable_id, v_apply, p_received_at, 'pix', v_charge.provider_charge_id, p_received_by)
    returning id into v_receipt_id;
  else
    -- Caso extremo: o saldo já era zero/negativo quando a cobrança
    -- confirmou (título já quitado por outro meio) — todo o valor
    -- recebido vira crédito, nenhum receipt é criado sobre saldo
    -- inexistente.
    v_receipt_id := null;
  end if;

  if v_overpayment > 0 then
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
  'Confirmação atômica de uma cobrança Pix — lock (for update) em payment_charges E receivables na mesma transação; idempotente (receipt_id já preenchido devolve o existente, nunca cria outro). NUNCA cria um receipt maior que o saldo atual do título: se o valor da cobrança excede o saldo (ex.: saldo mudou por pagamento manual entre a criação da cobrança e a confirmação), aplica só até o saldo e vira o excedente em client_credits (origin_payment_charge_id garante no máximo um crédito por cobrança). payment_charges.amount nunca é alterado — continua representando o valor total efetivamente recebido do provedor.';

grant execute on function public.confirm_payment_charge(uuid, date, uuid) to authenticated;
