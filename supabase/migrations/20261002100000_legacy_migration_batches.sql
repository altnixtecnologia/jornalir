-- Fase 35 — motor de migração do legado: editorias que faltaram na
-- auditoria (item 3) + controle persistente de lotes (item 8). Incremental
-- — não altera nenhuma migration anterior.

-- 1) Editorias que faltaram na auditoria (Fase 34 encontrou como
--    categorias sem editoria equivalente). Adiciona só as duas — nenhuma
--    editoria existente é removida ou renomeada.
insert into public.editorial_sections (name, slug, active, sort_order)
values
  ('Agricultura', 'agricultura', true, 10),
  ('Classificados', 'classificados', true, 11)
on conflict (slug) do nothing;

-- 2) Controle de lotes da migração do legado — staff-only, nunca pública,
--    e retomável (o importador consulta esta tabela para saber onde
--    parou; não depende da memória do terminal). Um lote é um intervalo
--    de datas (padrão: 2 anos, ver docs/legacy-migration-status.json).
create table public.legacy_migration_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'incomplete', 'failed')),
  expected_articles integer,
  imported_articles integer not null default 0,
  skipped_existing integer not null default 0,
  failed_articles integer not null default 0,
  expected_image_references integer,
  expected_unique_images integer,
  migrated_images integer not null default 0,
  reused_images integer not null default 0,
  failed_images integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.legacy_migration_batches is
  'Controle persistente dos lotes de migração do site legado (Fase 35+). Um lote só recebe status=complete quando esperado e importado reconciliam (ver docs/AI_HANDOFF.md).';
comment on column public.legacy_migration_batches.batch_key is
  'Identificador estável do lote, ex.: "2015-2016". Usado pelo importador para retomada idempotente.';
comment on column public.legacy_migration_batches.metadata is
  'Erros e exceções do lote (ex.: URLs com data bugada, falhas de imagem) — nunca a lista completa de matérias.';

create index legacy_migration_batches_status_idx
  on public.legacy_migration_batches (status);

create trigger legacy_migration_batches_set_updated_at
  before update on public.legacy_migration_batches
  for each row
  execute function public.set_updated_at();

alter table public.legacy_migration_batches enable row level security;

create policy legacy_migration_batches_select_staff
  on public.legacy_migration_batches for select
  to authenticated
  using (public.is_active_staff());

create policy legacy_migration_batches_insert_staff
  on public.legacy_migration_batches for insert
  to authenticated
  with check (public.is_active_staff());

create policy legacy_migration_batches_update_staff
  on public.legacy_migration_batches for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — histórico de migração é permanente, mesmo
-- princípio de article_external_sources.
