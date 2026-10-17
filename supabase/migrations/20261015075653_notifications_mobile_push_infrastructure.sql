-- Push notifications: private tokens, deduplicated deliveries and editorial outbox.
create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  app_kind text not null check (app_kind in ('site','sistema')),
  profile_id uuid references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  enabled boolean not null default true,
  news_opt_in boolean not null default false,
  urgent_opt_in boolean not null default false,
  agenda_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  constraint subscription_owner_for_app check (
    (app_kind='site' and profile_id is null and not agenda_opt_in)
    or (app_kind='sistema' and profile_id is not null and not news_opt_in and not urgent_opt_in)
  ),
  constraint subscription_short_fields check (
    char_length(endpoint) between 25 and 2048
    and char_length(p256dh) between 70 and 120
    and char_length(auth_secret) between 18 and 50
  )
);
create index if not exists notification_push_subscriptions_profile_idx on public.notification_push_subscriptions(profile_id) where enabled;
create index if not exists notification_push_subscriptions_app_idx on public.notification_push_subscriptions(app_kind) where enabled;
alter table public.notification_push_subscriptions enable row level security;
revoke all on public.notification_push_subscriptions from public,anon,authenticated;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null check (kind in ('news','urgent','agenda','system')),
  title text not null,
  body text not null default '',
  href text not null default '/',
  target_profile_id uuid references public.profiles(id) on delete cascade,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  last_error text,
  constraint outbox_target_check check (
    (kind in ('news','urgent') and target_profile_id is null)
    or (kind in ('agenda','system') and target_profile_id is not null)
  ),
  constraint outbox_href_safe check (left(href,1)='/' and left(href,2)<>'//')
);
create index if not exists notification_outbox_due_idx on public.notification_outbox(due_at) where status in ('pending','failed');
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public,anon,authenticated;

create table if not exists public.notification_push_deliveries (
  event_id uuid not null references public.notification_outbox(id) on delete cascade,
  subscription_id uuid not null references public.notification_push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed','gone','uncertain')),
  attempts smallint not null default 0,
  last_error text,
  sent_at timestamptz,
  primary key(event_id,subscription_id)
);
alter table public.notification_push_deliveries enable row level security;
revoke all on public.notification_push_deliveries from public,anon,authenticated;

comment on table public.notification_push_subscriptions is 'Tokens de aparelhos acessíveis somente com service role. Consentimento explícito por dispositivo; site público e sistema separados.';
comment on table public.notification_outbox is 'Fila de push com idempotência, não é o Telegram existente.';
;
