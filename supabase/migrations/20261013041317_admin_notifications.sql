create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'payment_received',
    'payment_cancelled',
    'payment_overdue',
    'whatsapp_failed',
    'system'
  )),
  title text not null,
  message text not null,
  href text,
  entity_type text,
  entity_id uuid,
  event_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (created_at desc)
  where read_at is null;

create index if not exists admin_notifications_entity_idx
  on public.admin_notifications (entity_type, entity_id);

alter table public.admin_notifications enable row level security;

drop policy if exists admin_notifications_select_staff on public.admin_notifications;
create policy admin_notifications_select_staff
  on public.admin_notifications for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists admin_notifications_update_staff on public.admin_notifications;
create policy admin_notifications_update_staff
  on public.admin_notifications for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

comment on table public.admin_notifications is
  'Notificações persistentes do sistema interno. Eventos automáticos são inseridos por service_role; equipe autenticada pode ler e marcar como lidos.';
