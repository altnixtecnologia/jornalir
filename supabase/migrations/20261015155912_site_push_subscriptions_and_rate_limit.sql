-- Assinaturas push do portal público: opt-in anônimo, sem leitura direta pelo navegador.
create table if not exists public.site_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 endpoint text not null unique,
 subscription_payload jsonb not null,
 management_hash text not null,
 ordinary_enabled boolean not null default false,
 urgent_enabled boolean not null default false,
 enabled boolean not null default true,
 platform text not null default 'web' check (platform in ('web','android','ios')),
 consented_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint site_push_endpoint_len check (octet_length(endpoint) between 40 and 1500),
 constraint site_push_has_consent check (ordinary_enabled or urgent_enabled or not enabled)
);
create table if not exists public.site_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.notification_events(id) on delete cascade,
 subscription_id uuid not null references public.site_push_subscriptions(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','sent','failed','expired')),
 last_error text,
 attempted_at timestamptz not null default now(),
 unique(event_id, subscription_id)
);
create table if not exists public.site_push_rate_limits (
 client_hash text not null,
 hour_bucket timestamptz not null,
 attempts integer not null default 0,
 primary key (client_hash, hour_bucket)
);
alter table public.site_push_subscriptions enable row level security;
alter table public.site_push_deliveries enable row level security;
alter table public.site_push_rate_limits enable row level security;
revoke all on public.site_push_subscriptions,public.site_push_deliveries,public.site_push_rate_limits from anon,authenticated;
create or replace function public.claim_site_push_registration(p_client_hash text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare total integer;
begin
 if octet_length(p_client_hash) <> 64 or p_client_hash !~ '^[a-f0-9]+$' then
   raise exception 'Identificador inválido';
 end if;
 insert into public.site_push_rate_limits(client_hash,hour_bucket,attempts)
 values(p_client_hash,date_trunc('hour',now()),1)
 on conflict(client_hash,hour_bucket) do update
 set attempts=public.site_push_rate_limits.attempts+1
 returning attempts into total;
 return total<=30;
end $$;
revoke all on function public.claim_site_push_registration(text) from public,anon,authenticated;
grant execute on function public.claim_site_push_registration(text) to service_role;
