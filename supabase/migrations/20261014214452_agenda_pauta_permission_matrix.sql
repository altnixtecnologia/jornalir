-- Permissoes por usuario para Agenda e Pauta (nunca conceder acesso pelo navegador).
create table if not exists public.staff_module_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module_name text not null check (module_name in ('agenda','pauta')),
  can_read boolean not null default false,
  can_write boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, module_name),
  constraint module_write_requires_read check (not can_write or can_read)
);
alter table public.staff_module_permissions enable row level security;
revoke all on public.staff_module_permissions from anon, authenticated;
grant select, insert, update on public.staff_module_permissions to authenticated;

create or replace function public.has_staff_module_access(p_module text, p_write boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
      and (
        p.role in ('owner','admin')
        or (p.role = 'operator' and exists (
          select 1 from public.staff_module_permissions m
          where m.profile_id = p.id
            and m.module_name = p_module
            and (case when p_write then m.can_write else m.can_read end)
        ))
      )
  );
$$;
revoke all on function public.has_staff_module_access(text,boolean) from public, anon;
grant execute on function public.has_staff_module_access(text,boolean) to authenticated;

drop policy if exists staff_module_permissions_select on public.staff_module_permissions;
create policy staff_module_permissions_select on public.staff_module_permissions
for select to authenticated using (
  profile_id = (select auth.uid()) or (select public.is_active_admin_or_owner())
);
drop policy if exists staff_module_permissions_insert on public.staff_module_permissions;
create policy staff_module_permissions_insert on public.staff_module_permissions
for insert to authenticated with check (
  (select public.is_active_admin_or_owner()) and exists(
    select 1 from public.profiles p where p.id = profile_id and p.role = 'operator'
  )
);
drop policy if exists staff_module_permissions_update on public.staff_module_permissions;
create policy staff_module_permissions_update on public.staff_module_permissions
for update to authenticated using (
  (select public.is_active_admin_or_owner()) and exists(
    select 1 from public.profiles p where p.id = profile_id and p.role = 'operator'
  )
) with check (
  (select public.is_active_admin_or_owner()) and exists(
    select 1 from public.profiles p where p.id = profile_id and p.role = 'operator'
  )
);

drop policy if exists agenda_events_select_staff on public.agenda_events;
create policy agenda_events_select_staff on public.agenda_events
  for select to authenticated using ((select public.has_staff_module_access('agenda',false)));
drop policy if exists agenda_events_insert_staff on public.agenda_events;
create policy agenda_events_insert_staff on public.agenda_events
  for insert to authenticated with check (
    (select public.has_staff_module_access('agenda',true)) and created_by = (select auth.uid())
  );
drop policy if exists agenda_events_update_staff on public.agenda_events;
create policy agenda_events_update_staff on public.agenda_events
  for update to authenticated using ((select public.has_staff_module_access('agenda',true)))
  with check ((select public.has_staff_module_access('agenda',true)));

drop policy if exists agenda_event_assignees_select_staff on public.agenda_event_assignees;
create policy agenda_event_assignees_select_staff on public.agenda_event_assignees
  for select to authenticated using ((select public.has_staff_module_access('agenda',false)));
drop policy if exists agenda_event_assignees_insert_staff on public.agenda_event_assignees;
create policy agenda_event_assignees_insert_staff on public.agenda_event_assignees
  for insert to authenticated with check (
    (select public.has_staff_module_access('agenda',true)) and created_by = (select auth.uid())
  );
drop policy if exists agenda_event_assignees_update_staff on public.agenda_event_assignees;
create policy agenda_event_assignees_update_staff on public.agenda_event_assignees
  for update to authenticated using ((select public.has_staff_module_access('agenda',true)))
  with check ((select public.has_staff_module_access('agenda',true)));
drop policy if exists agenda_event_assignees_delete_staff on public.agenda_event_assignees;
create policy agenda_event_assignees_delete_staff on public.agenda_event_assignees
  for delete to authenticated using ((select public.has_staff_module_access('agenda',true)));

drop policy if exists weekly_pauta_items_select_staff on public.weekly_pauta_items;
create policy weekly_pauta_items_select_staff on public.weekly_pauta_items
  for select to authenticated using ((select public.has_staff_module_access('pauta',false)));
drop policy if exists weekly_pauta_items_insert_staff on public.weekly_pauta_items;
create policy weekly_pauta_items_insert_staff on public.weekly_pauta_items
  for insert to authenticated with check (
    (select public.has_staff_module_access('pauta',true)) and created_by = (select auth.uid())
  );
drop policy if exists weekly_pauta_items_update_staff on public.weekly_pauta_items;
create policy weekly_pauta_items_update_staff on public.weekly_pauta_items
  for update to authenticated using ((select public.has_staff_module_access('pauta',true)))
  with check ((select public.has_staff_module_access('pauta',true)));
