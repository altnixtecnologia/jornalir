-- Jornal IR: fundacao de notificacoes mobile (SEM envio push ate ativar provedor).
create table if not exists public.notification_devices (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.profiles(id) on delete cascade,
 app_kind text not null check (app_kind in ('site','sistema')),
 platform text not null check (platform in ('web','android','ios')),
 subscription_endpoint text not null,
 subscription_payload jsonb not null default '{}'::jsonb,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (app_kind,subscription_endpoint)
);
create index if not exists notification_devices_profile on public.notification_devices(profile_id,enabled);
create table if not exists public.notification_preferences (
 profile_id uuid not null references public.profiles(id) on delete cascade,
 app_kind text not null check (app_kind in ('site','sistema')),
 ordinary_enabled boolean not null default false,
 urgent_enabled boolean not null default false,
 agenda_enabled boolean not null default false,
 sound_enabled boolean not null default false,
 vibration_enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (profile_id,app_kind)
);
create table if not exists public.notification_events (
 id uuid primary key default gen_random_uuid(),
 app_kind text not null check (app_kind in ('site','sistema')),
 kind text not null check (kind in ('ordinary','urgent','agenda','administrative')),
 title text not null,
 body text not null,
 href text,
 scheduled_at timestamptz not null default now(),
 dedupe_key text unique,
 created_at timestamptz not null default now()
);
create table if not exists public.notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.notification_events(id) on delete cascade,
 device_id uuid not null references public.notification_devices(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','sent','failed','expired')),
 attempts integer not null default 0 check (attempts between 0 and 20),
 last_error text,
 last_attempt_at timestamptz,
 created_at timestamptz not null default now(),
 unique (event_id,device_id)
);
alter table public.notification_devices enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_devices,public.notification_preferences,public.notification_events,public.notification_deliveries from anon;
revoke all on public.notification_devices,public.notification_preferences,public.notification_events,public.notification_deliveries from authenticated;
grant select,insert,update,delete on public.notification_devices to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
drop policy if exists device_owner_read on public.notification_devices;
create policy device_owner_read on public.notification_devices for select to authenticated using (profile_id=(select auth.uid()));
drop policy if exists device_owner_insert on public.notification_devices;
create policy device_owner_insert on public.notification_devices for insert to authenticated with check (profile_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active));
drop policy if exists device_owner_update on public.notification_devices;
create policy device_owner_update on public.notification_devices for update to authenticated using (profile_id=(select auth.uid())) with check (profile_id=(select auth.uid()));
drop policy if exists device_owner_delete on public.notification_devices;
create policy device_owner_delete on public.notification_devices for delete to authenticated using (profile_id=(select auth.uid()));
drop policy if exists notification_preferences_read on public.notification_preferences;
create policy notification_preferences_read on public.notification_preferences for select to authenticated using (profile_id=(select auth.uid()));
drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences for insert to authenticated with check (profile_id=(select auth.uid()));
drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences for update to authenticated using (profile_id=(select auth.uid())) with check (profile_id=(select auth.uid()));
-- Eventos e entregas permanecem acessíveis apenas à service_role.
