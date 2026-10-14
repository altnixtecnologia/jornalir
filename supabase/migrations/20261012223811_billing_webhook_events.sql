create table if not exists public.billing_webhook_events (
  id text primary key,
  provider text not null default 'asaas' check (provider in ('asaas')),
  event_type text not null,
  provider_charge_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create index if not exists billing_webhook_events_provider_charge_idx
  on public.billing_webhook_events (provider, provider_charge_id);

alter table public.billing_webhook_events enable row level security;

drop policy if exists billing_webhook_events_staff_select on public.billing_webhook_events;
create policy billing_webhook_events_staff_select
  on public.billing_webhook_events for select to authenticated
  using (public.is_active_staff());

comment on table public.billing_webhook_events is
  'Eventos recebidos do provedor de cobrança. ID do evento é chave de idempotência para webhooks entregues mais de uma vez.';
