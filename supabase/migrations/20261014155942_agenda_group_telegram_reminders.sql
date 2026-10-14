-- Compromissos: lembretes somente pelo grupo dedicado do Telegram.
alter table public.agenda_events
  add column if not exists reminder_minutes integer default 30
  check (reminder_minutes is null or reminder_minutes in (0,5,10,15,30,60,120,1440));
create table if not exists public.agenda_telegram_delivery (
  event_key text primary key,
  event_id uuid not null references public.agenda_events(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.agenda_telegram_delivery enable row level security;
revoke all on public.agenda_telegram_delivery from anon, authenticated;
create index if not exists agenda_telegram_delivery_event_idx
  on public.agenda_telegram_delivery(event_id);
