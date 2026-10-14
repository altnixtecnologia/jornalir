create table public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  start_time time without time zone,
  end_time time without time zone,
  timezone text not null default 'America/Sao_Paulo',
  location text,
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled')),
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  updated_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_events_title_length check (char_length(btrim(title)) between 1 and 180),
  constraint agenda_events_description_length check (description is null or char_length(description) <= 4000),
  constraint agenda_events_location_length check (location is null or char_length(location) <= 240),
  constraint agenda_events_time_order check (end_time is null or start_time is null or end_time >= start_time)
);

comment on table public.agenda_events is
  'Compromissos internos da equipe do JornalIR. Base compartilhada pelo painel e futuro app da equipe.';

create index agenda_events_date_idx
  on public.agenda_events (event_date, start_time, status);
create index agenda_events_created_by_idx
  on public.agenda_events (created_by, event_date desc);

create trigger agenda_events_set_updated_at
  before update on public.agenda_events
  for each row execute function public.set_updated_at();

create or replace function public.set_agenda_event_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger agenda_events_set_actor
  before insert or update on public.agenda_events
  for each row execute function public.set_agenda_event_actor();

alter table public.agenda_events enable row level security;

create policy agenda_events_select_staff
  on public.agenda_events for select to authenticated
  using ((select public.is_active_staff()));

create policy agenda_events_insert_staff
  on public.agenda_events for insert to authenticated
  with check (
    (select public.is_active_staff())
    and created_by = (select auth.uid())
  );

create policy agenda_events_update_staff
  on public.agenda_events for update to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

create table public.agenda_event_assignees (
  event_id uuid not null references public.agenda_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  assignment_type text not null default 'responsible'
    check (assignment_type in ('responsible','participant')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

comment on table public.agenda_event_assignees is
  'Responsáveis e participantes vinculados aos compromissos da Agenda.';

create index agenda_event_assignees_profile_idx
  on public.agenda_event_assignees (profile_id, event_id);

alter table public.agenda_event_assignees enable row level security;

create policy agenda_event_assignees_select_staff
  on public.agenda_event_assignees for select to authenticated
  using ((select public.is_active_staff()));

create policy agenda_event_assignees_insert_staff
  on public.agenda_event_assignees for insert to authenticated
  with check (
    (select public.is_active_staff())
    and created_by = (select auth.uid())
  );

create policy agenda_event_assignees_update_staff
  on public.agenda_event_assignees for update to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

create policy agenda_event_assignees_delete_staff
  on public.agenda_event_assignees for delete to authenticated
  using ((select public.is_active_staff()));

create table public.weekly_pauta_items (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  title text not null,
  description text,
  due_date date,
  due_time time without time zone,
  responsible_profile_id uuid references public.profiles(id),
  agenda_event_id uuid references public.agenda_events(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','completed','cancelled')),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references public.profiles(id),
  updated_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_pauta_title_length check (char_length(btrim(title)) between 1 and 240),
  constraint weekly_pauta_description_length check (description is null or char_length(description) <= 4000),
  constraint weekly_pauta_week_monday check (extract(isodow from week_start) = 1),
  constraint weekly_pauta_due_in_week check (
    due_date is null or (due_date >= week_start and due_date <= week_start + 6)
  )
);

comment on table public.weekly_pauta_items is
  'Pauta operacional semanal: o que cada integrante precisa fazer. Conclusões são preservadas como histórico e podem se ligar à Agenda e a matérias.';

create index weekly_pauta_week_idx
  on public.weekly_pauta_items (week_start, status, due_date, sort_order, created_at);
create index weekly_pauta_responsible_idx
  on public.weekly_pauta_items (responsible_profile_id, week_start desc);
create index weekly_pauta_agenda_event_idx
  on public.weekly_pauta_items (agenda_event_id)
  where agenda_event_id is not null;

create trigger weekly_pauta_items_set_updated_at
  before update on public.weekly_pauta_items
  for each row execute function public.set_updated_at();

create or replace function public.set_weekly_pauta_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
    new.completed_by := coalesce(auth.uid(), new.completed_by);
  elsif new.status <> 'completed' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

create trigger weekly_pauta_items_set_actor
  before insert or update on public.weekly_pauta_items
  for each row execute function public.set_weekly_pauta_actor();

alter table public.weekly_pauta_items enable row level security;

create policy weekly_pauta_items_select_staff
  on public.weekly_pauta_items for select to authenticated
  using ((select public.is_active_staff()));

create policy weekly_pauta_items_insert_staff
  on public.weekly_pauta_items for insert to authenticated
  with check (
    (select public.is_active_staff())
    and created_by = (select auth.uid())
  );

create policy weekly_pauta_items_update_staff
  on public.weekly_pauta_items for update to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

create policy profiles_select_active_staff_directory
  on public.profiles for select to authenticated
  using ((select public.is_active_staff()) and active = true);
