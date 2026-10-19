-- Backend FCM do Jornal IR. PREPARADO, NÃO APLICADO em produção.
-- Tokens nativos são separados das inscrições Web Push: FCM != VAPID.
-- Somente service_role acessa tabelas e RPCs; jamais anon/authenticated.
-- A ativação dos envios é independente, por NATIVE_FCM_DELIVERY_ENABLED=true.

create table if not exists public.native_push_devices (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null unique,
  management_hash text not null,
  fcm_token text not null,
  fcm_token_hash text not null unique,
  platform text not null default 'android' check (platform = 'android'),
  ordinary_enabled boolean not null default false,
  urgent_enabled boolean not null default false,
  enabled boolean not null default false,
  consented_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint native_push_management_hash_shape check (management_hash ~ '^[0-9a-f]{64}$'),
  constraint native_push_fcm_token_hash_shape check (fcm_token_hash ~ '^[0-9a-f]{64}$'),
  constraint native_push_fcm_token_length check (char_length(fcm_token) between 40 and 4096)
);
create index if not exists native_push_enabled_last_seen_idx
  on public.native_push_devices (last_seen_at desc)
  where enabled;

create table if not exists public.native_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete restrict,
  device_id uuid not null references public.native_push_devices(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'expired', 'uncertain')),
  attempted_at timestamptz,
  completed_at timestamptz,
  last_error text,
  fcm_message_id text,
  created_at timestamptz not null default now(),
  unique (event_id, device_id)
);
create index if not exists native_push_deliveries_pending_idx
  on public.native_push_deliveries (created_at, id) where status = 'pending';
create index if not exists native_push_deliveries_event_idx
  on public.native_push_deliveries (event_id, status);

create table if not exists public.native_push_rate_limits (
  client_hash text not null,
  window_start timestamptz not null,
  requests integer not null default 0,
  primary key (client_hash, window_start)
);
create index if not exists native_push_rate_limits_cleanup_idx
  on public.native_push_rate_limits (window_start);

alter table public.native_push_devices enable row level security;
alter table public.native_push_deliveries enable row level security;
alter table public.native_push_rate_limits enable row level security;
revoke all on public.native_push_devices from public, anon, authenticated;
revoke all on public.native_push_deliveries from public, anon, authenticated;
revoke all on public.native_push_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.native_push_devices to service_role;
grant select, insert, update on public.native_push_deliveries to service_role;
grant select, insert, update on public.native_push_rate_limits to service_role;

-- O limite é aplicado atomicamente antes de cada tentativa de registro,
-- inclusive para clientes que ainda não têm cadastro.
create or replace function public.claim_native_push_registration(p_client_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_requests integer;
begin
  if p_client_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  insert into public.native_push_rate_limits (client_hash, window_start, requests)
  values (p_client_hash, v_window, 1)
  on conflict (client_hash, window_start) do update
    set requests = public.native_push_rate_limits.requests + 1
  returning requests into v_requests;
  return v_requests <= 12;
end;
$$;
revoke all on function public.claim_native_push_registration(text) from public, anon, authenticated;
grant execute on function public.claim_native_push_registration(text) to service_role;

-- Seleção idempotente: mesmo evento/dispositivo só entra uma vez; a
-- reserva FOR UPDATE SKIP LOCKED impede dupla entrega concorrente.
-- Não enviar evento anterior ao aceite nem eventos com mais de 24 horas.
-- Nenhuma entrega é repetida automaticamente após status 'uncertain'.
create or replace function public.claim_native_push_deliveries(p_limit integer default 20)
returns table(delivery_id uuid, event_id uuid, device_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.native_push_deliveries (event_id, device_id)
  select e.id, d.id
  from public.notification_events e
  join public.native_push_devices d
    on d.enabled
   and d.platform = 'android'
   and d.consented_at <= e.scheduled_at
   and d.last_seen_at >= now() - interval '60 days'
   and ((e.kind = 'ordinary' and d.ordinary_enabled)
     or (e.kind = 'urgent' and d.urgent_enabled))
  where e.app_kind = 'site'
    and e.kind in ('ordinary', 'urgent')
    and e.target_profile_id is null
    and e.scheduled_at between now() - interval '24 hours' and now()
  order by e.scheduled_at desc
  limit 3000
  -- Sem alvo nominal: evita ambiguidade PL/pgSQL entre nomes de parâmetros
  -- OUT (event_id/device_id) e os nomes das colunas do índice único.
  on conflict do nothing;

  return query
  with eligible as (
    select n.id from public.native_push_deliveries n
    where n.status = 'pending'
    order by n.created_at, n.id
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  )
  update public.native_push_deliveries d
    set status = 'sending', attempted_at = now()
  from eligible
  where d.id = eligible.id
  returning d.id, d.event_id, d.device_id;
end;
$$;
revoke all on function public.claim_native_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_native_push_deliveries(integer) to service_role;

comment on table public.native_push_devices is
  'Instâncias Android consentidas para FCM; tokens de dispositivo privados (service_role somente).';
comment on table public.native_push_deliveries is
  'Auditoria de tentativas FCM; sent = aceito pelo FCM, NÃO confirmação de leitura no aparelho.';
