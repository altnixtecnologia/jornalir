-- Importação do jornal impresso em PDF (Parte G do Plano Mestre). Persiste
-- o fluxo já validado nas Fases 08–15: edição → PDF → candidatos → revisão
-- → matéria. Não altera o parser (@ir/pdf-extraction) — só dá um lugar real
-- para o resultado dele viver.

create table public.pdf_import_batches (
  id uuid primary key default gen_random_uuid(),
  newspaper_edition_id uuid not null references public.newspaper_editions (id),
  source_file_name text,
  page_count integer,
  pages_without_text integer[] not null default '{}',
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.pdf_import_batches is
  'Um lote = uma extração de um PDF para uma edição. pages_without_text/warnings espelham o retorno de extractCandidatesFromPdf.';

create index pdf_import_batches_edition_id_idx
  on public.pdf_import_batches (newspaper_edition_id);

alter table public.pdf_import_batches enable row level security;

create policy pdf_import_batches_select_staff
  on public.pdf_import_batches for select
  to authenticated
  using (public.is_active_staff());

create policy pdf_import_batches_insert_staff
  on public.pdf_import_batches for insert
  to authenticated
  with check (public.is_active_staff());

create table public.pdf_import_candidates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.pdf_import_batches (id) on delete cascade,
  newspaper_edition_id uuid not null references public.newspaper_editions (id),
  page_number integer,
  suggested_title text,
  suggested_subtitle text,
  suggested_body text,
  suggested_section_id uuid references public.editorial_sections (id),
  suggested_locality_id uuid references public.localities (id),
  suggested_media_ids uuid[] not null default '{}',
  -- Rastreabilidade da extração (ImportCandidateExtraction em @ir/types).
  extraction_method text check (extraction_method in ('textLayer', 'ocr', 'manual')),
  extraction_warnings jsonb not null default '[]'::jsonb,
  low_confidence_title boolean not null default false,
  possible_continuation boolean not null default false,
  possible_advertisement boolean not null default false,
  page_coverage jsonb,
  source_blocks jsonb not null default '[]'::jsonb,
  -- pending/kept: em revisão. discarded: nunca vira matéria. converted:
  -- gerou uma matéria (created_article_id preenchido — nunca reconvertido,
  -- reforçado pela policy de update abaixo). merged: absorvido por outro
  -- candidato (merged_into_id preenchido). split: foi dividido em dois
  -- (o candidato original correspondente à primeira metade permanece
  -- "pending"; este estado marca a origem que gerou um segundo candidato).
  status text not null default 'pending'
    check (status in ('pending', 'kept', 'discarded', 'converted', 'merged', 'split')),
  created_article_id uuid references public.articles (id),
  merged_into_id uuid references public.pdf_import_candidates (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdf_import_candidates_converted_has_article
    check (status <> 'converted' or created_article_id is not null),
  constraint pdf_import_candidates_merged_has_target
    check (status <> 'merged' or merged_into_id is not null)
);

comment on table public.pdf_import_candidates is
  'Um candidato a matéria extraído de uma página do PDF. Nunca publicado automaticamente — sempre revisão manual antes de conversão.';
comment on column public.pdf_import_candidates.status is
  'pending/kept = em revisão; discarded = nunca vira matéria; converted = já gerou created_article_id (não reconvertível); merged = absorvido por outro candidato; split = deu origem a um segundo candidato.';

create index pdf_import_candidates_batch_id_idx
  on public.pdf_import_candidates (batch_id);
create index pdf_import_candidates_edition_id_idx
  on public.pdf_import_candidates (newspaper_edition_id);
create index pdf_import_candidates_status_idx
  on public.pdf_import_candidates (status);

create trigger pdf_import_candidates_set_updated_at
  before update on public.pdf_import_candidates
  for each row
  execute function public.set_updated_at();

alter table public.pdf_import_candidates enable row level security;

create policy pdf_import_candidates_select_staff
  on public.pdf_import_candidates for select
  to authenticated
  using (public.is_active_staff());

create policy pdf_import_candidates_insert_staff
  on public.pdf_import_candidates for insert
  to authenticated
  with check (public.is_active_staff());

-- Um candidato já convertido nunca pode ser alterado de novo (reforça no
-- banco a mesma regra já aplicada em ImportCandidateService.convertToDraft
-- desde a Fase 15 — defesa em profundidade, não confia só na aplicação).
create policy pdf_import_candidates_update_staff_not_converted
  on public.pdf_import_candidates for update
  to authenticated
  using (public.is_active_staff() and status <> 'converted')
  with check (public.is_active_staff());
