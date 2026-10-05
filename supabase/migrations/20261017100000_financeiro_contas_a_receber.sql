-- Financeiro — Parte 3A: fundação + Contas a Receber + Contratos
-- Institucionais. Depende de public.clients (20261011100000_clients.sql,
-- ainda pendente) e não interfere em public.subscriptions
-- (20261015/20261016). Sequência de aplicação:
--   1. 20261011100000_clients.sql
--   2. 20261015100000_subscriptions.sql
--   3. 20261016100000_subscriptions_operational.sql
--   4. esta migration
--
-- IMPORTANTE: NÃO aplicada ainda. Nenhuma das três anteriores também foi
-- aplicada — esta continua a sequência, nunca a reordena.
--
-- Escopo desta fase: só CONTAS A RECEBER (títulos, recebimentos parciais,
-- abatimentos/quitação com diferença, estornos) + Contratos Institucionais
-- (entidade própria, com documentos próprios — upload real de arquivo
-- fica para quando o Storage/R2 voltar a ser tocado; aqui só a
-- referência). Contas a pagar, fornecedores, contas bancárias e fluxo de
-- caixa são deliberadamente deixados de fora — o modelo não os impede,
-- mas nenhuma tabela deles é criada agora.

-- ==================================================================
-- 1) CONTRATO INSTITUCIONAL — entidade própria (nunca dados soltos
-- dentro de cada título). Um contrato pode gerar vários títulos ao
-- longo do tempo. Poucos campos obrigatórios de propósito: cada
-- órgão (prefeitura, câmara, SAMAE, CASAN etc.) preenche o que tem.
-- ==================================================================

create sequence public.institutional_contracts_reference_seq;

create or replace function public.generate_institutional_contract_reference()
returns text
language sql
as $$
  select 'IR-CTR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.institutional_contracts_reference_seq')::text, 6, '0');
$$;

create table public.institutional_contracts (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_institutional_contract_reference(),

  client_id uuid not null references public.clients (id),

  contract_number text,
  process_number text,
  modality text,
  bidding_reference text,
  object text,
  contracted_amount numeric(12, 2) check (contracted_amount is null or contracted_amount >= 0),
  starts_at date,
  ends_at date,
  status text not null default 'active' check (status in ('active', 'expired', 'terminated')),
  notes text,

  -- Campos complementares que variam demais de órgão pra órgão pra
  -- justificar colunas próprias agora (ex.: convênio, fonte de recurso) —
  -- nunca usado pra dado que já tem campo dedicado acima.
  extra_data jsonb not null default '{}'::jsonb,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.institutional_contracts is
  'Contrato/licitação institucional (prefeitura, câmara, SAMAE, CASAN, autarquias etc.) como entidade própria — um contrato pode gerar vários títulos (public.receivables) ao longo do tempo. Poucos campos obrigatórios: cada órgão trabalha de forma diferente.';
comment on column public.institutional_contracts.extra_data is
  'Dados complementares opcionais específicos de um órgão (ex.: convênio, fonte de recurso) — nunca duplica campo que já tem coluna própria.';

create index institutional_contracts_client_id_idx on public.institutional_contracts (client_id);
create index institutional_contracts_status_idx on public.institutional_contracts (status);
create index institutional_contracts_created_at_idx on public.institutional_contracts (created_at desc);

create trigger institutional_contracts_set_updated_at
  before update on public.institutional_contracts
  for each row
  execute function public.set_updated_at();

create or replace function public.set_institutional_contract_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger institutional_contracts_set_actor
  before insert on public.institutional_contracts
  for each row
  execute function public.set_institutional_contract_actor();

alter table public.institutional_contracts enable row level security;

create policy institutional_contracts_select_staff
  on public.institutional_contracts for select
  to authenticated
  using (public.is_active_staff());

create policy institutional_contracts_insert_staff
  on public.institutional_contracts for insert
  to authenticated
  with check (public.is_active_staff());

create policy institutional_contracts_update_staff
  on public.institutional_contracts for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — mesmo princípio do restante do sistema.

-- ==================================================================
-- 2) DOCUMENTOS DO CONTRATO — cadastro orientado pelo documento
-- (contrato original, aditivo, empenho, nota/documento, autorização,
-- outro). `file_reference` só guarda a referência; upload real (R2)
-- fica para quando o Storage voltar a ser tocado — NÃO implementado
-- nesta fase. `extracted_data` guarda o resultado BRUTO de uma futura
-- extração automática — é sempre AUXÍLIO, nunca verdade definitiva; os
-- campos reais do contrato (tabela acima) só mudam quando o usuário
-- confere e salva manualmente.
-- ==================================================================

create table public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.institutional_contracts (id) on delete cascade,

  document_type text not null check (document_type in ('contract', 'amendment', 'commitment_order', 'invoice', 'authorization', 'other')),
  name text not null,
  file_reference text,
  document_date date,
  notes text,

  -- Resultado bruto de extração automática (quando existir) — nunca
  -- aplicado automaticamente aos campos reais do contrato.
  extracted_data jsonb not null default '{}'::jsonb,

  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.contract_documents is
  'Documentos de um contrato institucional (contrato original, aditivos, empenhos, notas, autorizações). file_reference é só a referência — upload real (R2) é módulo futuro, não implementado aqui. extracted_data é auxílio bruto de extração automática futura, nunca aplicado automaticamente aos campos reais do contrato.';
comment on column public.contract_documents.extracted_data is
  'Resultado BRUTO de uma extração automática (quando existir) — regra absoluta: nunca é aplicado automaticamente; o usuário sempre confere/edita antes de qualquer campo real do contrato mudar.';

create index contract_documents_contract_id_idx on public.contract_documents (contract_id);
create index contract_documents_document_type_idx on public.contract_documents (document_type);

alter table public.contract_documents enable row level security;

create policy contract_documents_select_staff
  on public.contract_documents for select
  to authenticated
  using (public.is_active_staff());

create policy contract_documents_insert_staff
  on public.contract_documents for insert
  to authenticated
  with check (public.is_active_staff());

-- Sem policy de update/delete — documento anexado não é editado depois
-- (reenviar = novo documento); nunca removido.

-- ==================================================================
-- 3) TÍTULOS / CONTAS A RECEBER. `source_id` é uma referência GENÉRICA
-- (sem FK) — a origem pode ser uma assinatura (public.subscriptions),
-- uma futura publicidade, ou nenhuma (avulso); forçar uma FK aqui
-- acoplaria este módulo a uma tabela específica por origem. `status`
-- guarda só os estados persistidos e simples pedidos — "vencido"/"vence
-- hoje"/"vencendo" são SEMPRE calculados (due_date vs. hoje), nunca
-- gravados como status.
-- ==================================================================

create sequence public.receivables_reference_seq;

create or replace function public.generate_receivable_reference()
returns text
language sql
as $$
  select 'IR-REC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receivables_reference_seq')::text, 6, '0');
$$;

create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_receivable_reference(),

  client_id uuid not null references public.clients (id),
  description text not null,

  source_type text not null check (source_type in ('subscription', 'advertising', 'institutional_contract', 'miscellaneous', 'other')),
  -- Sem FK — mesma origem pode ser public.subscriptions.id hoje e uma
  -- tabela de publicidade ainda não criada no futuro. Índice composto
  -- abaixo cobre a consulta "títulos desta assinatura/origem".
  source_id uuid,
  -- Texto legível da origem (ex.: "Assinatura IR-ASS-2026-000012"),
  -- preenchido pela aplicação — nunca recalculado via join obrigatório.
  source_reference text,

  contract_id uuid references public.institutional_contracts (id),

  original_amount numeric(12, 2) not null check (original_amount >= 0),
  issue_date date not null default current_date,
  due_date date not null,
  -- Competência (ex.: mês de referência de uma publicidade/assinatura) —
  -- opcional e DISTINTA de issue_date/due_date.
  competency_date date,

  status text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'cancelled')),
  notes text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint receivables_due_date_not_before_issue check (due_date >= issue_date)
);

comment on table public.receivables is
  'Título/conta a receber. status guarda só estados persistidos simples (open/partially_paid/paid/cancelled) — "vencido"/"vence hoje"/"vencendo" são SEMPRE calculados comparando due_date com a data atual, nunca gravados. source_id é referência genérica sem FK (pode ser subscriptions.id hoje, outra origem no futuro) — nunca acopla este módulo a uma tabela de origem específica.';
comment on column public.receivables.source_id is
  'Referência genérica e opcional ao registro de origem (ex.: subscriptions.id quando source_type=subscription) — sem FK de propósito, pra não acoplar Financeiro a uma tabela de origem específica.';

create index receivables_client_id_idx on public.receivables (client_id);
create index receivables_status_idx on public.receivables (status);
create index receivables_due_date_idx on public.receivables (due_date);
create index receivables_source_idx on public.receivables (source_type, source_id);
create index receivables_contract_id_idx on public.receivables (contract_id) where contract_id is not null;
create index receivables_created_at_idx on public.receivables (created_at desc);

create trigger receivables_set_updated_at
  before update on public.receivables
  for each row
  execute function public.set_updated_at();

create or replace function public.set_receivable_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger receivables_set_actor
  before insert on public.receivables
  for each row
  execute function public.set_receivable_actor();

alter table public.receivables enable row level security;

create policy receivables_select_staff
  on public.receivables for select
  to authenticated
  using (public.is_active_staff());

create policy receivables_insert_staff
  on public.receivables for insert
  to authenticated
  with check (public.is_active_staff());

create policy receivables_update_staff
  on public.receivables for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — cancelar via status='cancelled' é a única
-- remoção, nunca apagar a linha.

-- ==================================================================
-- 4) RECEBIMENTOS — cada um é um registro INDEPENDENTE e imutável
-- (exceto os três campos de estorno, preenchidos uma única vez).
-- "Quem recebeu" (received_by, escolhido manualmente — a pessoa que
-- fisicamente recebeu o dinheiro) e "quem registrou" (recorded_by,
-- SEMPRE auth.uid() da sessão) são conceitos DIFERENTES, nunca
-- confundidos.
-- ==================================================================

create table public.receivable_receipts (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.receivables (id),

  amount numeric(12, 2) not null check (amount > 0),
  received_at date not null default current_date,
  payment_method text check (payment_method in ('cash', 'pix', 'bank_transfer', 'check', 'card', 'other')),
  reference text,
  notes text,

  -- Pessoa que efetivamente recebeu o dinheiro — escolhida manualmente
  -- entre o staff (nunca auto-preenchida); pode ficar nula se
  -- desconhecida/não aplicável.
  received_by uuid references public.profiles (id),
  -- Quem registrou no sistema — SEMPRE auth.uid() via trigger, nunca um
  -- valor vindo do cliente, mesmo se received_by for a mesma pessoa.
  recorded_by uuid references public.profiles (id),
  recorded_at timestamptz not null default now(),

  -- Estorno: preenchidos uma única vez, nunca desfeitos — o registro
  -- original nunca é apagado nem alterado além destes três campos.
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id),
  reversal_reason text,

  constraint receivable_receipts_reversal_all_or_nothing check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and reversed_by is not null and reversal_reason is not null)
  )
);

comment on table public.receivable_receipts is
  'Recebimento individual de um título — nunca sobrescreve outro, um título pode ter vários. received_by (quem efetivamente recebeu, escolha manual) e recorded_by (quem registrou no sistema, sempre auth.uid()) são conceitos diferentes e sempre gravados separadamente. Estorno preenche reversed_at/reversed_by/reversal_reason uma única vez — o registro original nunca é apagado nem alterado além desses três campos; o saldo do título só soma recebimentos com reversed_at is null.';

create index receivable_receipts_receivable_id_idx on public.receivable_receipts (receivable_id);
create index receivable_receipts_received_at_idx on public.receivable_receipts (received_at desc);

create or replace function public.set_receivable_receipt_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger receivable_receipts_set_actor
  before insert on public.receivable_receipts
  for each row
  execute function public.set_receivable_receipt_actor();

alter table public.receivable_receipts enable row level security;

create policy receivable_receipts_select_staff
  on public.receivable_receipts for select
  to authenticated
  using (public.is_active_staff());

create policy receivable_receipts_insert_staff
  on public.receivable_receipts for insert
  to authenticated
  with check (public.is_active_staff());

-- UPDATE só existe pra permitir o estorno (preencher os 3 campos de
-- reversão uma única vez) — a aplicação nunca envia mudança em
-- amount/receivable_id/etc. por este caminho; a policy em si não
-- distingue coluna, mas a Server Action é o único chamador real.
create policy receivable_receipts_update_staff
  on public.receivable_receipts for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — nunca apagar um recebimento, só estornar.

-- ==================================================================
-- 5) ABATIMENTOS/DESCONTOS — registro próprio e auditável, nunca um
-- ajuste direto no valor do título. Motivo é OBRIGATÓRIO.
-- ==================================================================

create table public.receivable_adjustments (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.receivables (id),

  amount numeric(12, 2) not null check (amount > 0),
  adjustment_type text not null check (adjustment_type in ('discount', 'settlement_difference')),
  reason text not null,

  authorized_by uuid references public.profiles (id),
  recorded_by uuid references public.profiles (id),
  recorded_at timestamptz not null default now(),
  notes text,

  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id),
  reversal_reason text,

  constraint receivable_adjustments_reversal_all_or_nothing check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and reversed_by is not null and reversal_reason is not null)
  )
);

comment on table public.receivable_adjustments is
  'Abatimento/desconto de um título — registro próprio e auditável (nunca altera original_amount). adjustment_type começa com discount (desconto comum) e settlement_difference (diferença dispensada numa quitação com diferença, ver fluxo "Quitar com diferença"). reason é obrigatório. Estorno segue a mesma regra de receivable_receipts — nunca apagado, só marcado reversed_*; saldo só soma abatimentos com reversed_at is null.';

create index receivable_adjustments_receivable_id_idx on public.receivable_adjustments (receivable_id);

create or replace function public.set_receivable_adjustment_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger receivable_adjustments_set_actor
  before insert on public.receivable_adjustments
  for each row
  execute function public.set_receivable_adjustment_actor();

alter table public.receivable_adjustments enable row level security;

create policy receivable_adjustments_select_staff
  on public.receivable_adjustments for select
  to authenticated
  using (public.is_active_staff());

create policy receivable_adjustments_insert_staff
  on public.receivable_adjustments for insert
  to authenticated
  with check (public.is_active_staff());

create policy receivable_adjustments_update_staff
  on public.receivable_adjustments for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — mesmo princípio de receivable_receipts.

-- ==================================================================
-- 6) VISÃO COM SALDO — evita N+1 na listagem/relatórios (soma só
-- recebimentos/abatimentos válidos, isto é, reversed_at is null).
-- security_invoker=true (Postgres 15+) é o que garante que esta view
-- continua staff-only: sem isso, uma view roda com o privilégio de quem
-- a criou e IGNORARIA a RLS staff-only das tabelas abaixo pra qualquer
-- role autenticada (mesmo padrão de risco que as views públicas do site
-- evitam só por serem, de propósito, públicas — aqui é dado financeiro,
-- nunca pode ter o mesmo tratamento).
-- ==================================================================

create view public.receivables_with_balance
with (security_invoker = true)
as
select
  r.*,
  coalesce(rec.total_received, 0) as total_received,
  coalesce(adj.total_adjustments, 0) as total_adjustments,
  r.original_amount - coalesce(rec.total_received, 0) - coalesce(adj.total_adjustments, 0) as balance
from public.receivables r
left join (
  select receivable_id, sum(amount) as total_received
  from public.receivable_receipts
  where reversed_at is null
  group by receivable_id
) rec on rec.receivable_id = r.id
left join (
  select receivable_id, sum(amount) as total_adjustments
  from public.receivable_adjustments
  where reversed_at is null
  group by receivable_id
) adj on adj.receivable_id = r.id;

comment on view public.receivables_with_balance is
  'receivables + total_received/total_adjustments/balance já calculados (só recebimentos/abatimentos não estornados) — evita N+1 na listagem/relatórios. security_invoker=true: a RLS staff-only das tabelas base continua valendo pra quem consulta a view, nunca bypassada.';
