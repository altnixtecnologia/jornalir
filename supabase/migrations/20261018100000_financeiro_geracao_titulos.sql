-- Financeiro — Parte 3B: geração de títulos a partir de Assinaturas/
-- Contratos. Incremental sobre 20261017100000_financeiro_contas_a_receber.sql
-- (que depende de clients -> subscriptions -> subscriptions_operational).
-- Sequência de aplicação:
--   1. 20261011100000_clients.sql
--   2. 20261015100000_subscriptions.sql
--   3. 20261016100000_subscriptions_operational.sql
--   4. 20261017100000_financeiro_contas_a_receber.sql
--   5. esta migration
--
-- IMPORTANTE: NÃO aplicada ainda. Nenhuma migration anterior foi
-- alterada — esta só acrescenta.

-- ==================================================================
-- 1) IDEMPOTÊNCIA DAS COBRANÇAS DE ASSINATURA. `receivables.source_id`
-- já guardava uma referência genérica sem FK (deliberado, pra não
-- acoplar a origem a uma tabela específica); para a proteção de
-- duplicidade pedida na Parte 3B — robusta, por constraint de banco,
-- não só na UI — precisamos de uma coluna própria com FK real e um
-- índice único parcial. `subscription_id` é preenchido SÓ quando
-- source_type='subscription' (nunca para avulso/contrato/publicidade
-- futura — a unicidade é deliberadamente restrita a assinaturas, como
-- pedido). competency_date já existia (opcional); passa a ser exigida
-- pela aplicação (não pelo banco, que mantém a coluna nullable para
-- não quebrar títulos de outras origens) sempre que subscription_id
-- for preenchido.
alter table public.receivables
  add column subscription_id uuid references public.subscriptions (id);

comment on column public.receivables.subscription_id is
  'Preenchido SÓ quando source_type=subscription — referência real (com FK) à assinatura de origem, usada pela unicidade abaixo. Nunca usado por outras origens (avulso/contrato/publicidade), que não têm essa restrição.';

create unique index receivables_subscription_competency_unique
  on public.receivables (subscription_id, competency_date)
  where subscription_id is not null;

comment on index public.receivables_subscription_competency_unique is
  'Nunca duas cobranças da MESMA assinatura para a MESMA competência — proteção robusta contra duplicidade, aplicada só a títulos de origem assinatura (índice parcial). Receitas avulsas, contratos e futura publicidade não têm essa restrição.';

create index receivables_subscription_id_idx on public.receivables (subscription_id) where subscription_id is not null;

-- ==================================================================
-- 2) ADITIVOS CONTRATUAIS — entidade própria e pequena, de propósito
-- (Parte 3B, item 9: "não criar gestão jurídica complexa"). Nunca
-- altera institutional_contracts.contracted_amount diretamente; o
-- valor vigente (original + aditivos válidos) é sempre CALCULADO pela
-- aplicação a partir desta tabela, preservando o histórico completo.
-- ==================================================================

create table public.contract_amendments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.institutional_contracts (id) on delete cascade,

  amount numeric(12, 2) not null check (amount > 0),
  -- Nova data final de vigência, se o aditivo também prorrogar o
  -- contrato — opcional (um aditivo pode só mudar valor).
  new_ends_at date,
  -- Documento que originou o aditivo (tipo 'amendment' em
  -- contract_documents) — opcional, sem obrigar a ordem de anexação.
  document_id uuid references public.contract_documents (id),

  reason text,
  notes text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.contract_amendments is
  'Aditivo contratual — valor adicional (sempre positivo) e/ou nova data final de vigência. NUNCA altera institutional_contracts.contracted_amount/ends_at diretamente; o valor e a vigência vigentes são sempre calculados somando os aditivos válidos ao original, preservando o histórico completo (Parte 3B, item 9).';

create index contract_amendments_contract_id_idx on public.contract_amendments (contract_id);

alter table public.contract_amendments enable row level security;

create policy contract_amendments_select_staff
  on public.contract_amendments for select
  to authenticated
  using (public.is_active_staff());

create policy contract_amendments_insert_staff
  on public.contract_amendments for insert
  to authenticated
  with check (public.is_active_staff());

-- Sem policy de update/delete — mesmo princípio de contract_documents:
-- um aditivo registrado não é editado depois (um aditivo que corrige
-- outro é um novo aditivo); nunca removido, preserva histórico.
