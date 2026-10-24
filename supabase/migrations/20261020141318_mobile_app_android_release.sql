-- Versão oficial disponibilizada do APK piloto Android do Jornal IR.
-- Preparação apenas: esta migration NÃO publica APK nem habilita envios push.
create table if not exists public.mobile_app_releases (
  platform text primary key check (platform = 'android'),
  version_label text not null check (version_label ~ '^v\.[0-9]{2}\.[0-9]{2}$'),
  version_code integer not null check (version_code > 0),
  published boolean not null default false,
  apk_url text,
  apk_sha256 text,
  apk_size_bytes bigint,
  release_notes text not null default '',
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint mobile_app_release_data_valid check (
    (apk_url is null or (apk_url ~ '^https://' and length(apk_url) <= 1500))
    and (apk_sha256 is null or apk_sha256 ~ '^[0-9a-f]{64}$')
    and (apk_size_bytes is null or apk_size_bytes > 0)
  ),
  constraint mobile_app_published_requires_apk check (
    not published or (apk_url is not null and apk_sha256 is not null
      and apk_size_bytes is not null and published_at is not null)
  )
);

insert into public.mobile_app_releases
  (platform,version_label,version_code,published,release_notes)
values
  ('android','v.00.00',1,false,'Versão piloto inicial do Jornal IR.')
on conflict (platform) do nothing;

alter table public.mobile_app_releases enable row level security;

-- Leitores enxergam somente a versão realmente liberada para download.
-- O painel administrativo pode ver e editar a preparação antes da publicação.
create policy mobile_app_releases_read
  on public.mobile_app_releases for select
  to anon,authenticated
  using (published = true or public.is_active_admin_or_owner());

create policy mobile_app_releases_admin_update
  on public.mobile_app_releases for update
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

grant select on public.mobile_app_releases to anon,authenticated;
grant update on public.mobile_app_releases to authenticated;

create trigger mobile_app_releases_set_updated_at
  before update on public.mobile_app_releases
  for each row execute function public.set_updated_at();

comment on table public.mobile_app_releases is
  'Versão Android atual disponibilizada no site. Uma linha por plataforma; v.00.00 permanece indisponível até confirmar a existência do APK no R2. Não inclui tokens ou segredos.';
