alter table public.newspaper_editions
  add column if not exists archive_provider text
    check (archive_provider is null or archive_provider in ('r2','drive','supabase','external')),
  add column if not exists pdf_r2_key text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_file_size bigint
    check (pdf_file_size is null or pdf_file_size >= 0),
  add column if not exists pdf_sha256 text,
  add column if not exists cover_r2_key text,
  add column if not exists archived_at timestamptz;

comment on column public.newspaper_editions.archive_provider is
  'Origem física do PDF oficial: R2 é o destino padrão novo; drive/supabase/external permanecem para legado e migração gradual.';
comment on column public.newspaper_editions.pdf_r2_key is
  'Chave permanente do PDF oficial no Cloudflare R2. Os bytes nunca ficam no Postgres.';
comment on column public.newspaper_editions.pdf_sha256 is
  'SHA-256 do PDF oficial para deduplicação, integridade e reprocessamento seguro.';
comment on column public.newspaper_editions.cover_r2_key is
  'Chave da imagem WebP/JPEG da capa gerada da página 1 e usada no acervo público.';
comment on column public.newspaper_editions.cover_url is
  'URL pública da capa real da edição. Para novos uploads será uma imagem no R2, nunca um embed da página 1 do PDF.';

create index if not exists newspaper_editions_pdf_sha256_idx
  on public.newspaper_editions (pdf_sha256)
  where pdf_sha256 is not null;

create index if not exists newspaper_editions_active_publication_idx
  on public.newspaper_editions (active, publication_date desc, edition_number desc);

-- Os metadados das edições ativas alimentam o Jornal Online público.
-- Não há dados pessoais ou segredos nesta tabela; os bytes permanecem no R2.
drop policy if exists newspaper_editions_select_public on public.newspaper_editions;
create policy newspaper_editions_select_public
  on public.newspaper_editions for select
  to anon
  using (active = true);
