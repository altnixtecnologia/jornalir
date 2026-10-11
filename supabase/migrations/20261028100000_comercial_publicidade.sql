-- Comercial / Publicidade — módulo novo. NÃO aplicada ainda (nenhuma
-- migration deste projeto é aplicada por aqui — ver nota em cada
-- migration anterior). Depende de public.clients (20261011100000) e
-- public.receivables (20261017100000_financeiro_contas_a_receber.sql).
--
-- AUDITORIA PRÉVIA (resumo, ver relatório completo da tarefa):
-- - client_roles já tem o papel 'anunciante' (20261011100000_clients.sql)
--   — reaproveitado aqui, nenhum papel novo criado.
-- - receivables.source_type já tem 'advertising' (packages/types/src/
--   financeiro/index.ts) — reaproveitado; só faltava uma FK própria
--   (subscription_id/contract_id já existem pra assinatura/contrato,
--   'advertising' ainda não tinha o equivalente).
-- - Não existe nenhuma tabela comercial/anunciante/campanha hoje.
--   `ad_slots`/`ad_images` (docs/estrutura-banco-anuncios.md) são um
--   domínio DIFERENTE — rotação de banners estáticos no site público,
--   nada a ver com venda/contratação comercial.
--
-- Cliente/anunciante SEMPRE client_id -> public.clients — nenhuma coluna
-- de nome/CPF/CNPJ/telefone/e-mail/endereço duplicada aqui (princípio do
-- Cadastro mestre, mesmo de Assinaturas/NFS-e/Financeiro).

-- ==================================================================
-- 1) CATÁLOGO DE PRODUTOS/CANAIS COMERCIAIS. `channel` é um enum
-- fechado (pedido explícito do domínio: Jornal impresso/Site/Painel
-- LED/Redes sociais/Pacote/Outro) — só classifica o catálogo; a venda
-- em si guarda seu próprio `channel` como texto (snapshot, nunca um
-- join obrigatório — mesmo princípio dos snapshots de NFS-e). Preço
-- sugerido é só isso, sugerido: nunca obriga o valor da venda a bater.
-- ==================================================================

create table public.commercial_products (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  channel text not null check (channel in ('newspaper', 'website', 'led_panel', 'social_media', 'package', 'other')),
  description text,
  suggested_price numeric(12, 2) check (suggested_price is null or suggested_price >= 0),
  active boolean not null default true,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.commercial_products is
  'Catálogo simples de produtos/canais comerciais (ex.: "Classificado — edição impressa", "Banner — site", "Painel LED — mensal"). suggested_price é só sugestão: a venda (commercial_sales) nunca é obrigada a usar esse valor. Nunca apagado — só active=false.';

create index commercial_products_channel_idx on public.commercial_products (channel);
create index commercial_products_active_idx on public.commercial_products (active);

create trigger commercial_products_set_updated_at
  before update on public.commercial_products
  for each row
  execute function public.set_updated_at();

create or replace function public.set_commercial_product_actor()
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

create trigger commercial_products_set_actor
  before insert on public.commercial_products
  for each row
  execute function public.set_commercial_product_actor();

alter table public.commercial_products enable row level security;

create policy commercial_products_select_staff
  on public.commercial_products for select
  to authenticated
  using (public.is_active_staff());

create policy commercial_products_insert_staff
  on public.commercial_products for insert
  to authenticated
  with check (public.is_active_staff());

create policy commercial_products_update_staff
  on public.commercial_products for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — mesmo princípio do restante do sistema
-- (desativar via active=false, nunca apagar um produto já usado).

-- ==================================================================
-- 2) VENDA/CONTRATAÇÃO COMERCIAL (publicidade). Entidade própria,
-- deliberadamente simples (nunca um ERP comercial): representa a
-- OBRIGAÇÃO comercial/financeira. "Campanha/veiculação" (onde/quando é
-- exibida, além do canal já escolhido aqui) fica para uma etapa
-- futura (`commercial_placements`, avaliado e adiado — ver relatório,
-- item 18) — não criada agora por não ser imprescindível pra
-- segunda-feira e por evitar um scheduler complexo sem necessidade.
-- product_id é só rastreabilidade (nunca obrigatório); `channel` é
-- sempre um snapshot de texto, igual ao princípio de
-- NfseTomadorSnapshot — muda o produto no catálogo depois, a venda já
-- fechada não muda silenciosamente.
-- ==================================================================

create sequence public.commercial_sales_reference_seq;

create or replace function public.generate_commercial_sale_reference()
returns text
language sql
as $$
  select 'IR-COM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.commercial_sales_reference_seq')::text, 6, '0');
$$;

create table public.commercial_sales (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_commercial_sale_reference(),

  client_id uuid not null references public.clients (id),

  -- Rastreabilidade opcional ao catálogo — NUNCA a fonte de verdade da
  -- venda já fechada (channel abaixo é o snapshot real).
  product_id uuid references public.commercial_products (id),
  channel text not null,

  description text not null,
  start_date date not null,
  end_date date,

  amount numeric(12, 2) not null check (amount >= 0),

  -- Condição COMERCIAL (como foi negociado) — DISTINTA da forma de
  -- liquidação real de cada título no Financeiro (payment_method em
  -- receivable_receipts). 'trade'/'bailment' aqui só registram a
  -- intenção negocial; o título gerado ainda pode ser liquidado de
  -- outra forma se a negociação mudar depois (histórico financeiro é
  -- quem decide, nunca esta coluna).
  commercial_condition text not null default 'cash'
    check (commercial_condition in ('cash', 'installments', 'trade', 'bailment', 'courtesy', 'other')),
  installments_count int not null default 1 check (installments_count >= 1),

  -- Estados mínimos do domínio (nenhum "em análise"/"negociando"
  -- adicional sem necessidade real — item 22 da tarefa).
  status text not null default 'proposal'
    check (status in ('proposal', 'approved', 'active', 'completed', 'cancelled')),

  notes text,

  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commercial_sales_end_not_before_start check (end_date is null or end_date >= start_date)
);

comment on table public.commercial_sales is
  'Venda/contratação comercial (publicidade) — obrigação comercial/financeira. client_id SEMPRE aponta para public.clients (Cadastro mestre), nunca duplica nome/documento/contato aqui. channel é snapshot de texto (não um join obrigatório ao catálogo); product_id é só rastreabilidade opcional. Nunca apagada fisicamente — cancelamento é status=cancelled, preservando o histórico financeiro já gerado.';
comment on column public.commercial_sales.commercial_condition is
  'Condição NEGOCIADA (à vista/mensal/parcelado/permuta/comodato/cortesia/outro) — nunca confundir com payment_method de receivable_receipts, que é a forma de LIQUIDAÇÃO real de cada título, podendo diferir do que foi negociado aqui.';

create index commercial_sales_client_id_idx on public.commercial_sales (client_id);
create index commercial_sales_product_id_idx on public.commercial_sales (product_id) where product_id is not null;
create index commercial_sales_status_idx on public.commercial_sales (status);
create index commercial_sales_created_at_idx on public.commercial_sales (created_at desc);

create trigger commercial_sales_set_updated_at
  before update on public.commercial_sales
  for each row
  execute function public.set_updated_at();

create or replace function public.set_commercial_sale_actor()
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

create trigger commercial_sales_set_actor
  before insert or update on public.commercial_sales
  for each row
  execute function public.set_commercial_sale_actor();

alter table public.commercial_sales enable row level security;

create policy commercial_sales_select_staff
  on public.commercial_sales for select
  to authenticated
  using (public.is_active_staff());

create policy commercial_sales_insert_staff
  on public.commercial_sales for insert
  to authenticated
  with check (public.is_active_staff());

create policy commercial_sales_update_staff
  on public.commercial_sales for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — cancelar é sempre status='cancelled'.

-- ==================================================================
-- 3) PAPEL 'anunciante' GARANTIDO AUTOMATICAMENTE — mesmo desenho já
-- usado em Assinaturas (20261026100000_subscription_assinante_role.sql):
-- trigger AFTER INSERT, idempotente via ON CONFLICT DO NOTHING, nunca
-- remove outros papéis, nunca roda em UPDATE/DELETE (cancelar uma
-- venda não remove o papel 'anunciante' do cliente).
-- ==================================================================

create or replace function public.ensure_advertiser_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.client_roles (client_id, role)
  values (new.client_id, 'anunciante')
  on conflict (client_id, role) do nothing;
  return new;
end;
$$;

comment on function public.ensure_advertiser_role() is
  'Garante client_roles.role = anunciante para o client_id de toda nova venda comercial — idempotente (ON CONFLICT DO NOTHING), nunca remove outros papéis, nunca roda em UPDATE/DELETE (cancelar a venda não remove o papel).';

create trigger commercial_sales_ensure_advertiser_role
  after insert on public.commercial_sales
  for each row
  execute function public.ensure_advertiser_role();

-- Backfill idempotente — tabela nova, não deveria ter linhas ainda, mas
-- mantém o mesmo padrão de segurança das migrations anteriores.
insert into public.client_roles (client_id, role)
select distinct client_id, 'anunciante'
from public.commercial_sales
on conflict (client_id, role) do nothing;

-- ==================================================================
-- 4) RECEIVABLES — vínculo determinístico com a venda de origem.
-- source_type='advertising' já existia (sem FK própria, só o genérico
-- source_id/source_reference). Agora ganha o mesmo tratamento que
-- subscription_id/contract_id já têm: coluna própria com FK real +
-- índice único parcial — idempotência de "Gerar Financeiro" garantida
-- por CONSTRAINT de banco, nunca só pelo botão desabilitado na UI
-- (mesmo princípio de receivables_subscription_competency_unique,
-- 20261018100000_financeiro_geracao_titulos.sql). `installment_number`
-- é a parcela (1..N) dentro da venda — par (commercial_sale_id,
-- installment_number) nunca se repete.
-- ==================================================================

alter table public.receivables
  add column commercial_sale_id uuid references public.commercial_sales (id),
  add column installment_number int;

comment on column public.receivables.commercial_sale_id is
  'Preenchido SÓ quando source_type=advertising — referência real (com FK) à venda comercial de origem, usada pela unicidade abaixo. Nunca usado por outras origens.';
comment on column public.receivables.installment_number is
  'Número da parcela (1..N) dentro da venda comercial de origem — só faz sentido junto de commercial_sale_id.';

alter table public.receivables
  add constraint receivables_commercial_sale_installment_required
  check (commercial_sale_id is null or installment_number is not null);

-- Coerência de origem (auditoria de integridade posterior): um
-- receivable com commercial_sale_id preenchido SEMPRE é de origem
-- advertising — nunca o inverso (um receivable advertising legado pode
-- muito bem não ter commercial_sale_id, só source_id/source_reference
-- genéricos de antes deste módulo existir).
alter table public.receivables
  add constraint receivables_commercial_sale_requires_advertising
  check (commercial_sale_id is null or source_type = 'advertising');

create unique index receivables_commercial_sale_installment_unique
  on public.receivables (commercial_sale_id, installment_number)
  where commercial_sale_id is not null;

comment on index public.receivables_commercial_sale_installment_unique is
  'Nunca duas parcelas iguais (mesmo número) da MESMA venda comercial — proteção robusta contra clique duplo em "Gerar Financeiro", aplicada só a títulos de origem advertising (índice parcial).';

create index receivables_commercial_sale_id_idx on public.receivables (commercial_sale_id) where commercial_sale_id is not null;
