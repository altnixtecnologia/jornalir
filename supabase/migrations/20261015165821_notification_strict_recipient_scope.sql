-- Avisos privados do Sistema nunca podem ser enviados sem destinatário.
-- No portal público os avisos editoriais não devem ter destinatário interno.
alter table public.notification_events
  drop constraint if exists notification_events_target_scope;
alter table public.notification_events
  add constraint notification_events_target_scope
  check (
    (app_kind = 'sistema' and target_profile_id is not null)
    or
    (app_kind = 'site' and target_profile_id is null and kind in ('ordinary','urgent'))
  );