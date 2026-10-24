-- Módulo 3: claim do webhook e idempotência externa de notificações.
-- O serviço de processamento usa SOMENTE service_role, nunca sessão de operador.
alter table public.billing_webhook_events
  add column processing_token uuid,
  add column processing_at timestamptz;
create index billing_webhook_events_processing_idx
  on public.billing_webhook_events(processing_at)
  where processed_at is null and processing_token is not null;

create table public.billing_notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  payment_charge_id uuid not null references public.payment_charges(id) on delete restrict,
  notification_kind text not null check (notification_kind in ('payment_confirmed')),
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  to_phone text not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'uncertain')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint billing_notification_dispatches_once unique (payment_charge_id, notification_kind)
);
comment on table public.billing_notification_dispatches is
  'Reserva ANTES do envio à Meta: no máximo uma tentativa automática de confirmação por cobrança Asaas. Timeout ou falha ambígua exigem conciliação manual; reprocessamento não reenvia.';
alter table public.billing_notification_dispatches enable row level security;
revoke all on public.billing_notification_dispatches from public, anon, authenticated;
grant select, insert, update on public.billing_notification_dispatches to service_role;
-- Auditabilidade restrita à administração; operadores não manipulam reservas.
grant select on public.billing_notification_dispatches to authenticated;
create policy billing_notification_dispatches_admin_read
  on public.billing_notification_dispatches for select to authenticated
  using (public.is_active_admin_or_owner());
