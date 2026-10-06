-- Financeiro — Contratos Institucionais, Bloco 2: estados coerentes,
-- aditivos com redução/número/data de vigência, empenhos e vínculo
-- opcional título↔empenho. Incremental sobre
-- 20261019100000_financeiro_credito_cliente.sql.
-- Sequência de aplicação:
--   1. 20261011100000_clients.sql
--   2. 20261015100000_subscriptions.sql
--   3. 20261016100000_subscriptions_operational.sql
--   4. 20261017100000_financeiro_contas_a_receber.sql
--   5. 20261018100000_financeiro_geracao_titulos.sql
--   6. 20261019100000_financeiro_credito_cliente.sql
--   7. esta migration
--
-- IMPORTANTE: NÃO aplicada ainda. Nenhuma migration anterior foi
-- alterada — esta só acrescenta. Nenhuma linha existe ainda em
-- institutional_contracts/contract_amendments (nenhuma migration deste
-- projeto foi executada até hoje), então não há necessidade de
-- converter dados existentes.
--
-- NFS-e/emissão fiscal: módulo independente, NÃO implementado aqui —
-- nada nesta migration cria tabela ou coluna fiscal "por antecipação".
-- Retenção tributária: também NÃO implementada — a arquitetura atual
-- (receivable_adjustments com adjustment_type tipado, já testada ao
-- acrescentar credit_applied sem quebrar nada) já comporta um futuro
-- adjustment_type='tax_withholding' sem exigir mudança de schema agora.

-- ==================================================================
-- 1) ESTADOS DO CONTRATO (item 2) — "expired" deixa de ser um estado
-- GRAVADO (passa a ser só um indicador derivado, ver
-- computeContractVigencyFlag em @ir/types — mesmo princípio de
-- computeReceivableDueFlag). active/suspended alternam entre si;
-- terminated ("Encerrado")/cancelled ("Cancelado") são finais.
-- ==================================================================

alter table public.institutional_contracts
  drop constraint if exists institutional_contracts_status_check;

alter table public.institutional_contracts
  add constraint institutional_contracts_status_check
  check (status in ('active', 'suspended', 'terminated', 'cancelled'));

comment on column public.institutional_contracts.status is
  'Estado PERSISTIDO do contrato: active (vigente), suspended (suspenso), terminated (encerrado) ou cancelled (cancelado). "Vencido"/"próximo do vencimento" NUNCA são gravados aqui — são sempre calculados comparando a vigência vigente com a data atual (ver computeContractVigencyFlag em @ir/types).';

-- ==================================================================
-- 2) ADITIVOS — acréscimo OU redução de valor (item 3: "acréscimo/
-- redução"), mais número/referência do aditivo e data de vigência
-- (quando o aditivo passou a valer, distinta de created_at, que é só o
-- registro no sistema).
-- ==================================================================

alter table public.contract_amendments
  drop constraint if exists contract_amendments_amount_check;

alter table public.contract_amendments
  add constraint contract_amendments_amount_check
  check (amount <> 0);

alter table public.contract_amendments
  add column amendment_number text,
  add column effective_date date;

comment on column public.contract_amendments.amount is
  'Valor do aditivo — pode ser POSITIVO (acréscimo) ou NEGATIVO (redução), nunca zero. O valor vigente do contrato continua sempre calculado somando todos os aditivos ao original (nunca sobrescrito).';
comment on column public.contract_amendments.amendment_number is
  'Número/referência do aditivo no documento físico — texto livre, opcional (cada órgão numera do seu jeito).';
comment on column public.contract_amendments.effective_date is
  'Quando o aditivo passou a valer — opcional, distinto de created_at (que é só quando foi registrado no sistema).';

-- ==================================================================
-- 3) EMPENHOS (item 4) — entidade operacional própria. Um contrato
-- pode ter nenhum, um (global) ou vários empenhos ao longo da
-- vigência; nenhum título é obrigado a referenciar um.
-- ==================================================================

create table public.contract_commitment_orders (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.institutional_contracts (id) on delete cascade,

  number text not null,
  issue_date date not null,
  amount numeric(12, 2) check (amount is null or amount > 0),
  competency_date date,
  description text,
  document_id uuid references public.contract_documents (id),
  notes text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.contract_commitment_orders is
  'Empenho ligado a um contrato institucional (Bloco 2, item 4) — entidade própria, nunca presumida obrigatória pra todo título. amount/competency_date são opcionais (alguns órgãos emitem empenho sem valor fechado, ou um único empenho global cobrindo vários meses).';

create index contract_commitment_orders_contract_id_idx on public.contract_commitment_orders (contract_id);

alter table public.contract_commitment_orders enable row level security;

create policy contract_commitment_orders_select_staff
  on public.contract_commitment_orders for select
  to authenticated
  using (public.is_active_staff());

create policy contract_commitment_orders_insert_staff
  on public.contract_commitment_orders for insert
  to authenticated
  with check (public.is_active_staff());

-- Sem policy de update/delete — mesmo princípio de contract_amendments:
-- um empenho registrado não é editado depois (um empenho que substitui
-- outro é um empenho novo); nunca removido, preserva histórico.

-- ==================================================================
-- 4) VÍNCULO OPCIONAL TÍTULO ↔ EMPENHO (item 4: "permitir futuramente
-- relacionar um título a um empenho quando aplicável") — nunca
-- obrigatório, nunca presume que todo título de contrato precisa de
-- empenho.
-- ==================================================================

alter table public.receivables
  add column commitment_order_id uuid references public.contract_commitment_orders (id);

create index receivables_commitment_order_id_idx on public.receivables (commitment_order_id) where commitment_order_id is not null;

comment on column public.receivables.commitment_order_id is
  'Vínculo opcional a um empenho (public.contract_commitment_orders) — nunca obrigatório, mesmo em títulos de contrato institucional.';
