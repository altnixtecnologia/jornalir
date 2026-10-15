alter table public.notification_events
  add column if not exists target_profile_id uuid references public.profiles(id) on delete cascade;
create index if not exists notification_events_target_due
  on public.notification_events(app_kind, scheduled_at desc, target_profile_id);
do $$
begin
 if not exists(select 1 from pg_constraint where conname='notification_agenda_has_target') then
   alter table public.notification_events
   add constraint notification_agenda_has_target check (kind <> 'agenda' or target_profile_id is not null);
 end if;
end $$;