-- Fase 33 — preparação para migração do site legado. Incremental — não
-- altera nenhuma migration anterior. Não importa nenhum conteúdo — só
-- prepara a estrutura (owner/Auth/RLS existentes preservados).

-- 1) Editorias que faltam para cobrir o site antigo (item 1). Só
--    adiciona as que faltam — Economia/Eventos/Cidades (sem
--    correspondência no legado) continuam existindo, não são removidas.
insert into public.editorial_sections (name, slug, active, sort_order)
values
  ('Saúde', 'saude', true, 7),
  ('Sociais', 'sociais', true, 8),
  ('Colunistas', 'colunistas', true, 9)
on conflict (slug) do nothing;

-- 2) Autoria opcional da matéria (item 2) — nunca obrigatória; usada como
--    byline quando preenchida. Uma coluna assim, e nunca "cada colunista
--    vira editoria" — a matéria continua em `Colunistas`, o nome da
--    pessoa/coluna fica à parte.
alter table public.articles
  add column author_name text;

comment on column public.articles.author_name is
  'Autoria/byline opcional (ex.: nome do colunista) — nunca obrigatória, nunca uma editoria própria.';

-- 3) `origin` ganha `legacy_site` (item 3) — nunca usar `manual` para
--    conteúdo importado. Substitui a constraint antiga (drop + recreate,
--    igual ao padrão já usado em `article_placements_type_check` na
--    Fase 23).
alter table public.articles drop constraint articles_origin_check;
alter table public.articles
  add constraint articles_origin_check
  check (origin in ('manual', 'pdf', 'legacy_site'));

-- 4) Metadado opcional de origem de uma mídia legada (item 8) —
--    `public_url` continua aceitando a URL do site antigo na etapa
--    temporária; `origin_source_url` preserva essa URL original mesmo
--    depois de `storage_path`/`public_url` passarem a apontar para uma
--    cópia no nosso Storage (etapa definitiva, fora desta fase).
alter table public.media_assets
  add column origin_source_url text;

comment on column public.media_assets.origin_source_url is
  'URL original da mídia no site antigo, preservada mesmo depois de copiada para o Storage próprio (etapa definitiva, fora desta fase).';

-- 5) Rastreabilidade do legado (item 4/6/7) — tabela própria, nunca
--    misturada aos campos internos de `articles`. Preserva os dados
--    originais (categoria/subcategoria/autor/datas/URL) mesmo que já
--    tenham sido mapeados para o modelo novo.
create table public.article_external_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  provider text not null,
  external_id text,
  source_url text,
  source_slug text,
  original_category text,
  original_subcategory text,
  original_author text,
  original_published_at timestamptz,
  original_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  last_synced_at timestamptz,
  source_hash text,
  raw_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Pelo menos um identificador externo confiável precisa existir para
  -- a deduplicação (item 4) ter o que comparar.
  constraint article_external_sources_has_identifier
    check (external_id is not null or source_url is not null)
);

comment on table public.article_external_sources is
  'Rastreabilidade de conteúdo importado de uma fonte externa (site legado) — nunca misturada aos campos internos de articles. Uma matéria pode ter no máximo uma linha por provider (unique abaixo).';
comment on column public.article_external_sources.provider is
  'Identificador da fonte externa, ex.: informativo_regional_legacy (item 4).';

-- Nunca importar a mesma matéria externa duas vezes — chave única por
-- provider + external_id (quando existir) ou por provider + source_url
-- (fallback, quando a fonte não tem um id próprio).
create unique index article_external_sources_provider_external_id_key
  on public.article_external_sources (provider, external_id)
  where external_id is not null;

create unique index article_external_sources_provider_source_url_key
  on public.article_external_sources (provider, source_url)
  where source_url is not null;

-- Uma matéria só tem uma origem externa por provider (histórico de
-- re-sync usa `last_synced_at`, não uma segunda linha).
create unique index article_external_sources_article_provider_key
  on public.article_external_sources (article_id, provider);

create index article_external_sources_article_id_idx
  on public.article_external_sources (article_id);

create trigger article_external_sources_set_updated_at
  before update on public.article_external_sources
  for each row
  execute function public.set_updated_at();

alter table public.article_external_sources enable row level security;

create policy article_external_sources_select_staff
  on public.article_external_sources for select
  to authenticated
  using (public.is_active_staff());

create policy article_external_sources_insert_staff
  on public.article_external_sources for insert
  to authenticated
  with check (public.is_active_staff());

create policy article_external_sources_update_staff
  on public.article_external_sources for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — registro de proveniência é permanente, mesmo
-- princípio de audit_events/articles (nunca apagar rastro de importação).

-- 6) Camada pública (Fase 30) — `author_name` passa a ser exposto para
--    uso futuro de byline (item 2); `article_external_sources` nunca é
--    exposta ao público (é metadado interno de migração, não conteúdo).
-- `author_name` só pode ir no fim da lista de colunas: `CREATE OR REPLACE
-- VIEW` não permite inserir uma coluna no meio (muda a posição das
-- seguintes) — só acrescentar ao final é seguro.
create or replace view public.public_articles as
  select
    id, slug, title, subtitle, title_style, subtitle_style, body,
    section_id, locality_id, urgent, published_at, created_at, updated_at,
    author_name
  from public.articles
  where status = 'published';
