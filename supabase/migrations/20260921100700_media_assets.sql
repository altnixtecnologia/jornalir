-- Biblioteca de mídia (Parte D do Plano Mestre). Preparada corretamente
-- para o Supabase Storage (storage_path), mas upload real ainda não
-- funciona nesta fase — public_url continua aceitando uma URL já hospedada,
-- exatamente como o provider mock de @ir/mocks desde a Fase 06.

create sequence public.media_assets_reference_seq;

create or replace function public.generate_media_reference()
returns text
language sql
as $$
  select 'IR-MID-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.media_assets_reference_seq')::text, 6, '0');
$$;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique default public.generate_media_reference(),
  type text not null default 'image' check (type in ('image', 'video', 'document')),
  file_name text,
  -- Caminho no bucket do Supabase Storage quando o upload real existir.
  -- Nulo enquanto a mídia só é catalogada por URL já hospedada (fase atual).
  storage_path text,
  public_url text,
  title text not null,
  caption text,
  credit text,
  mime_type text,
  width integer,
  height integer,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_has_source check (storage_path is not null or public_url is not null)
);

comment on table public.media_assets is
  'Catálogo de mídia. title corresponde a "name" em packages/types (MediaAsset) — nome só para localizar na biblioteca, distinto de caption.';
comment on column public.media_assets.storage_path is
  'Caminho no bucket do Supabase Storage. Nulo enquanto não há upload real (fase atual usa public_url apontando para uma URL já hospedada).';

create index media_assets_created_at_idx on public.media_assets (created_at desc);

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row
  execute function public.set_updated_at();

alter table public.media_assets enable row level security;

create policy media_assets_select_staff
  on public.media_assets for select
  to authenticated
  using (public.is_active_staff());

create policy media_assets_insert_staff
  on public.media_assets for insert
  to authenticated
  with check (public.is_active_staff());

create policy media_assets_update_staff
  on public.media_assets for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());
