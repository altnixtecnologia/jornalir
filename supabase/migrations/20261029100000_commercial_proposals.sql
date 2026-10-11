-- Comercial — Propostas/Orçamentos. NÃO aplicada ainda (local apenas).
-- Depende de public.clients (20261011100000) e
-- public.commercial_products/commercial_sales (20261028100000).
--
-- AUDITORIA PRÉVIA (resumo, ver relatório da tarefa): commercial_sales
-- representa a OBRIGAÇÃO comercial/financeira já fechada; nenhum campo
-- dela foi reaproveitado por FK direta aqui de propósito — a proposta é
-- um documento ANTES da venda existir, só vira commercial_sales quando
-- convertida (campo converted_sale_id abaixo, nunca o inverso). O
-- catálogo commercial_products é reaproveitado como está (product_id
-- opcional nos itens, mesmo princípio de commercial_sales.product_id —
-- rastreabilidade, nunca fonte de verdade do item já fechado).

create sequence public.commercial_proposals_reference_seq;

create or replace function public.generate_commercial_proposal_reference()
returns text
language sql
as $$
  select 'IR-PROP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.commercial_proposals_reference_seq')::text, 6, '0');
$$;

-- ==================================================================
-- 1) PROPOSTA/ORÇAMENTO — documento pré-venda. Pode nunca virar venda
-- (recusada/arquivada) — isso é normal, nunca um erro. Itens vivem em
-- tabela própria (commercial_proposal_items) — o total é sempre
-- CALCULADO a partir deles (nunca uma coluna redundante aqui, mesmo
-- princípio de receivables_with_balance/recomputeReceivableStatus:
-- nunca grava o que pode ser derivado).
-- ==================================================================

create table public.commercial_proposals (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_commercial_proposal_reference(),

  client_id uuid not null references public.clients (id),

  proposal_date date not null default current_date,
  valid_until date,

  commercial_condition text not null default 'cash'
    check (commercial_condition in ('cash', 'installments', 'trade', 'bailment', 'courtesy', 'other')),

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'rejected', 'archived')),

  -- Vínculo determinístico proposta->venda — nunca duas conversões da
  -- mesma proposta (checagem de idempotência no service + este campo
  -- como proteção real). NUNCA apagado/sobrescrito depois de setado.
  converted_sale_id uuid references public.commercial_sales (id),

  notes text,
  internal_notes text,

  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commercial_proposals_valid_until_not_before_date check (valid_until is null or valid_until >= proposal_date)
);

comment on table public.commercial_proposals is
  'Proposta/orçamento comercial — documento pré-venda, pode nunca virar venda (recusada/arquivada é normal). "Vencida" nunca é um status gravado — é sempre calculado comparando valid_until com a data atual, só enquanto status ainda é draft/sent. converted_sale_id é a proteção real contra conversão duplicada.';
comment on column public.commercial_proposals.converted_sale_id is
  'Preenchido quando a proposta foi convertida em venda — nunca apagado depois. Usado pelo service para recusar uma segunda conversão da mesma proposta.';

create index commercial_proposals_client_id_idx on public.commercial_proposals (client_id);
create index commercial_proposals_status_idx on public.commercial_proposals (status);
create index commercial_proposals_created_at_idx on public.commercial_proposals (created_at desc);

create trigger commercial_proposals_set_updated_at
  before update on public.commercial_proposals
  for each row
  execute function public.set_updated_at();

create or replace function public.set_commercial_proposal_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  elsif TG_OP = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger commercial_proposals_set_actor
  before insert or update on public.commercial_proposals
  for each row
  execute function public.set_commercial_proposal_actor();

alter table public.commercial_proposals enable row level security;

create policy commercial_proposals_select_staff
  on public.commercial_proposals for select
  to authenticated
  using (public.is_active_staff());

create policy commercial_proposals_insert_staff
  on public.commercial_proposals for insert
  to authenticated
  with check (public.is_active_staff());

create policy commercial_proposals_update_staff
  on public.commercial_proposals for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — arquivar é sempre status='archived'.

-- ==================================================================
-- 2) ITENS DA PROPOSTA — cada item é snapshot de texto (description),
-- nunca depende de um join ao catálogo pra existir; product_id é só
-- rastreabilidade opcional, mesmo princípio de commercial_sales.channel
-- vs product_id. line_total nunca é gravado — sempre
-- quantity*unit_price - discount_amount, calculado na aplicação.
-- ==================================================================

create table public.commercial_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.commercial_proposals (id) on delete cascade,

  product_id uuid references public.commercial_products (id),
  description text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  sort_order int not null default 0,

  created_at timestamptz not null default now(),

  constraint commercial_proposal_items_discount_not_above_subtotal check (discount_amount <= quantity * unit_price)
);

comment on table public.commercial_proposal_items is
  'Item de uma proposta — description é sempre snapshot de texto (nunca depende do catálogo pra existir); product_id é só rastreabilidade opcional. Total do item e da proposta são SEMPRE calculados na aplicação (quantity*unit_price - discount_amount), nunca gravados aqui.';

create index commercial_proposal_items_proposal_id_idx on public.commercial_proposal_items (proposal_id);

alter table public.commercial_proposal_items enable row level security;

create policy commercial_proposal_items_select_staff
  on public.commercial_proposal_items for select
  to authenticated
  using (public.is_active_staff());

create policy commercial_proposal_items_insert_staff
  on public.commercial_proposal_items for insert
  to authenticated
  with check (public.is_active_staff());

create policy commercial_proposal_items_update_staff
  on public.commercial_proposal_items for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy commercial_proposal_items_delete_staff
  on public.commercial_proposal_items for delete
  to authenticated
  using (public.is_active_staff());

-- Itens têm delete real (diferente das entidades-raiz do módulo): uma
-- proposta ainda em draft/sent pode ter seus itens reeditados livremente
-- (remover/recriar linha) — ela só "vira documento fechado" quando
-- aprovada/convertida, e mesmo assim os itens continuam existindo (nunca
-- apagados retroativamente pelo service depois disso).

-- ==================================================================
-- 3) VÍNCULO NA VENDA — de onde a venda se originou, quando aplicável.
-- Nunca obrigatório (uma venda pode nascer direto, sem proposta).
-- ==================================================================

alter table public.commercial_sales
  add column proposal_id uuid references public.commercial_proposals (id);

comment on column public.commercial_sales.proposal_id is
  'Proposta de origem, quando a venda nasceu de uma conversão — nunca obrigatório (venda pode ser criada direto). Ver commercial_proposals.converted_sale_id para o vínculo inverso.';

create index commercial_sales_proposal_id_idx on public.commercial_sales (proposal_id) where proposal_id is not null;
