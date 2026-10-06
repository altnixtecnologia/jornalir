-- Financeiro — Parte 3B.1: crédito do cliente (ledger auditável),
-- aplicação automática em cobranças da mesma origem e composição da
-- fatura/carnê. Incremental sobre
-- 20261018100000_financeiro_geracao_titulos.sql.
-- Sequência de aplicação:
--   1. 20261011100000_clients.sql
--   2. 20261015100000_subscriptions.sql
--   3. 20261016100000_subscriptions_operational.sql
--   4. 20261017100000_financeiro_contas_a_receber.sql
--   5. 20261018100000_financeiro_geracao_titulos.sql
--   6. esta migration
--
-- IMPORTANTE: NÃO aplicada ainda. Nenhuma migration anterior foi
-- alterada — esta só acrescenta (inclusive via ALTER TABLE em tabelas já
-- existentes, mesmo princípio já usado pela migration anterior ao
-- acrescentar receivables.subscription_id).

-- ==================================================================
-- 1) LEDGER DE CRÉDITO DO CLIENTE. Deliberadamente NÃO um campo mutável
-- (ex.: clients.credit_balance) — cada crédito é uma linha própria,
-- imutável quanto à origem/valor original; o saldo é SEMPRE derivado
-- (original_amount - soma das aplicações válidas, ver view abaixo).
-- `subscription_id`/`contract_id` espelham a mesma semântica de
-- `receivables.subscription_id`/`contract_id` — preenchidos só quando
-- `source_type` corresponde, usados pra casar "mesma origem" na
-- aplicação automática (item 3/4: assinatura/contrato têm recorrência
-- bem definida; avulso/publicidade/outro nunca aplicam automaticamente).
-- ==================================================================

create table public.client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),

  source_type text not null check (source_type in ('subscription', 'advertising', 'institutional_contract', 'miscellaneous', 'other')),
  subscription_id uuid references public.subscriptions (id),
  contract_id uuid references public.institutional_contracts (id),
  check (subscription_id is null or source_type = 'subscription'),
  check (contract_id is null or source_type = 'institutional_contract'),

  -- De qual título/recebimento este crédito surgiu (item 2: "de qual
  -- pagamento surgiu o crédito") — rastreabilidade, nunca uma FK que
  -- force a origem a existir pra sempre do mesmo jeito (por isso
  -- nullable: um crédito pode, no futuro, vir de outro fluxo que não um
  -- recebimento específico).
  origin_receivable_id uuid references public.receivables (id),
  origin_receipt_id uuid references public.receivable_receipts (id),

  original_amount numeric(12, 2) not null check (original_amount > 0),
  reason text,
  notes text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),

  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id),
  reversal_reason text,
  constraint client_credits_reversal_all_or_nothing check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and reversed_by is not null and reversal_reason is not null)
  )
);

comment on table public.client_credits is
  'Crédito do cliente — ledger auditável (Parte 3B.1). Nunca um saldo mutável: original_amount é imutável após criado, e o saldo disponível é sempre CALCULADO (original_amount - aplicações válidas em receivable_adjustments.adjustment_type=credit_applied, ver view client_credits_with_balance). subscription_id/contract_id só preenchidos quando source_type corresponde — usados pra decidir "mesma origem" na aplicação automática (nunca cruza origens diferentes).';

create index client_credits_client_id_idx on public.client_credits (client_id);
create index client_credits_subscription_id_idx on public.client_credits (subscription_id) where subscription_id is not null;
create index client_credits_contract_id_idx on public.client_credits (contract_id) where contract_id is not null;

alter table public.client_credits enable row level security;

create policy client_credits_select_staff
  on public.client_credits for select
  to authenticated
  using (public.is_active_staff());

create policy client_credits_insert_staff
  on public.client_credits for insert
  to authenticated
  with check (public.is_active_staff());

-- Só pra marcar reversed_*  (mesmo princípio de receivable_adjustments_update_staff)
-- — um crédito nunca é editado em valor/origem depois de criado.
create policy client_credits_update_staff
  on public.client_credits for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- ==================================================================
-- 2) APLICAÇÃO DE CRÉDITO NUM TÍTULO = REAPROVEITAR
-- receivable_adjustments (item 13/18: "não reescrever tudo sem
-- necessidade" + "não tratar crédito aplicado como novo dinheiro
-- recebido" — já é exatamente o que receivable_adjustments modela:
-- reduz o saldo do título sem ser um recebimento). Em vez de uma tabela
-- de "aplicações" paralela, acrescenta um novo adjustment_type
-- (credit_applied) + a FK pra qual crédito foi usado.
-- ==================================================================

alter table public.receivable_adjustments
  drop constraint if exists receivable_adjustments_adjustment_type_check;

alter table public.receivable_adjustments
  add constraint receivable_adjustments_adjustment_type_check
  check (adjustment_type in ('discount', 'settlement_difference', 'credit_applied'));

alter table public.receivable_adjustments
  add column credit_id uuid references public.client_credits (id);

alter table public.receivable_adjustments
  add constraint receivable_adjustments_credit_id_matches_type check (
    (adjustment_type = 'credit_applied' and credit_id is not null)
    or (adjustment_type <> 'credit_applied' and credit_id is null)
  );

comment on column public.receivable_adjustments.credit_id is
  'Preenchido SÓ quando adjustment_type=credit_applied — qual client_credits foi usado pra reduzir o saldo deste título. Cada linha aqui é uma "aplicação" auditável (quem, quando, quanto); nunca um crédito é aplicado sem deixar este rastro.';

create index receivable_adjustments_credit_id_idx on public.receivable_adjustments (credit_id) where credit_id is not null;

-- ==================================================================
-- 3) SALDO DISPONÍVEL DO CRÉDITO — sempre derivado, nunca armazenado.
-- ==================================================================

create view public.client_credits_with_balance
with (security_invoker = true)
as
select
  cc.*,
  coalesce(app.total_applied, 0) as total_applied,
  cc.original_amount - coalesce(app.total_applied, 0) as balance
from public.client_credits cc
left join (
  select credit_id, sum(amount) as total_applied
  from public.receivable_adjustments
  where reversed_at is null and adjustment_type = 'credit_applied'
  group by credit_id
) app on app.credit_id = cc.id;

comment on view public.client_credits_with_balance is
  'client_credits + saldo já calculado (original_amount - soma das aplicações válidas, ver receivable_adjustments.credit_id). Nunca consultar client_credits sozinha pra saber quanto ainda está disponível.';

-- ==================================================================
-- 4) APLICAÇÃO ATÔMICA DE CRÉDITO (ajuste pós-revisão, antes do
-- commit desta fase) — a leitura do saldo disponível + a gravação da
-- aplicação PRECISAM acontecer numa única transação com lock da linha
-- do crédito, nunca só uma pré-checagem em TypeScript seguida de um
-- INSERT separado (isso teria uma janela de corrida: duas operações
-- concorrentes poderiam ler o mesmo saldo disponível ANTES de qualquer
-- uma aplicar, e as duas achariam que há saldo suficiente).
--
-- `select ... for update` na linha de public.client_credits é a
-- proteção: a segunda transação concorrente bloqueia ali até a
-- primeira ter comitado (ou abortado); quando ela finalmente lê o
-- saldo, já é o saldo ATUALIZADO pós-primeira aplicação. Mesmo
-- princípio aplicado à linha do título (public.receivables), pro lado
-- do saldo do título.
--
-- Nunca cria um campo mutável de saldo — o saldo aqui dentro também é
-- CALCULADO a cada chamada (soma de receivable_adjustments válidos),
-- só que agora sob lock, dentro da mesma transação da gravação.
--
-- Quando o saldo disponível (crédito ou título) for menor que o valor
-- pedido, aplica só o que houver (nunca mais do que o saldo real no
-- momento do lock) e devolve quanto foi de fato aplicado — quem chama
-- (ReceivableService) decide se tenta outro crédito em seguida.
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
set search_path = public
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
  if p_requested_amount is null or p_requested_amount <= 0 then
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

comment on function public.apply_client_credit is
  'Aplicação atômica de crédito num título (Parte 3B.1, ajuste de integridade) — lock (for update) na linha do crédito E na linha do título dentro da mesma transação, recalcula os dois saldos sob lock, grava a aplicação (receivable_adjustments.credit_id) e atualiza o status do título, tudo-ou-nada. Nunca deixa duas transações concorrentes aplicarem o mesmo saldo disponível duas vezes. Aplica só o que realmente houver de saldo no momento do lock (nunca mais que isso), e devolve quanto foi de fato aplicado.';

grant execute on function public.apply_client_credit(uuid, uuid, numeric, text, uuid) to authenticated;
