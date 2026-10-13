alter table public.newspaper_editions
  add column if not exists cover_url text,
  add column if not exists archive_provider text,
  add column if not exists pdf_r2_key text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_file_size bigint,
  add column if not exists pdf_sha256 text,
  add column if not exists cover_r2_key text,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.newspaper_editions'::regclass
      and conname='newspaper_editions_archive_provider_check'
  ) then
    alter table public.newspaper_editions
      add constraint newspaper_editions_archive_provider_check
      check (
        archive_provider is null
        or archive_provider in ('r2', 'drive', 'supabase', 'external')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.newspaper_editions'::regclass
      and conname='newspaper_editions_pdf_file_size_check'
  ) then
    alter table public.newspaper_editions
      add constraint newspaper_editions_pdf_file_size_check
      check (pdf_file_size is null or pdf_file_size >= 0);
  end if;
end $$;

comment on column public.newspaper_editions.archive_provider is
  'Origem do PDF oficial da edição: r2, drive, supabase ou external.';
comment on column public.newspaper_editions.pdf_r2_key is
  'Chave do PDF oficial no Cloudflare R2 quando archive_provider=r2.';
comment on column public.newspaper_editions.cover_r2_key is
  'Chave da capa gerada da página 1 no Cloudflare R2.';
comment on column public.newspaper_editions.pdf_sha256 is
  'SHA-256 do PDF oficial, usado para integridade e deduplicação da extração.';
