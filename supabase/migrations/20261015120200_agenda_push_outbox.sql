-- Lembretes push individuais da Agenda: idempotentes e reajustados em edicoes.
create or replace function public.sync_agenda_push_notifications(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- A fila ainda não processada é substituída sempre que datas, horário,
  -- situação ou responsáveis mudam. Entregas já despachadas são auditadas.
  delete from public.notification_outbox
   where event_key like 'agenda:' || p_event_id::text || ':%'
     and status in ('pending','failed');

  insert into public.notification_outbox(
    event_key,kind,title,body,href,target_profile_id,due_at
  )
  select
    'agenda:' || e.id::text || ':' || a.profile_id::text || ':'
      || extract(epoch from (
        (e.event_date + e.start_time) at time zone 'America/Sao_Paulo'
      ) - make_interval(mins=>e.reminder_minutes))::bigint::text,
    'agenda',
    left('Jornal IR | ' || e.title,140),
    left('Compromisso em ' || e.reminder_minutes::text || ' min · '
        || to_char(e.event_date,'DD/MM/YYYY') || ' às '
        || to_char(e.start_time,'HH24:MI') || 'h',280),
    '/sistema/agenda',
    a.profile_id,
    (e.event_date + e.start_time) at time zone 'America/Sao_Paulo'
      - make_interval(mins=>e.reminder_minutes)
  from public.agenda_events e
  join public.agenda_event_assignees a on a.event_id=e.id
  join public.profiles p on p.id=a.profile_id and p.active
  where e.id=p_event_id and e.status='scheduled'
    and e.start_time is not null and e.reminder_minutes is not null
    and (
      (e.event_date + e.start_time) at time zone 'America/Sao_Paulo'
        - make_interval(mins=>e.reminder_minutes)
    ) > now()-interval '5 minutes'
  on conflict(event_key) do nothing;
end
$$;

create or replace function public.on_agenda_event_sync_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.sync_agenda_push_notifications(
    case when tg_op='DELETE' then old.id else new.id end
  );
  return case when tg_op='DELETE' then old else new end;
end
$$;

create or replace function public.on_agenda_assignee_sync_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.sync_agenda_push_notifications(
    case when tg_op='DELETE' then old.event_id else new.event_id end
  );
  return case when tg_op='DELETE' then old else new end;
end
$$;

drop trigger if exists agenda_push_sync_event on public.agenda_events;
create trigger agenda_push_sync_event
after insert or update or delete on public.agenda_events
for each row execute function public.on_agenda_event_sync_push();

drop trigger if exists agenda_push_sync_assignee on public.agenda_event_assignees;
create trigger agenda_push_sync_assignee
after insert or update or delete on public.agenda_event_assignees
for each row execute function public.on_agenda_assignee_sync_push();

create or replace function public.is_valid_agenda_push_notification(
  p_event_id uuid,p_profile_id uuid,p_due_at timestamptz
) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.agenda_events e
    join public.agenda_event_assignees a on a.event_id=e.id
    join public.profiles p on p.id=a.profile_id and p.active
    where e.id=p_event_id and a.profile_id=p_profile_id
      and e.status='scheduled' and e.start_time is not null
      and e.reminder_minutes is not null
      and (
        (e.event_date + e.start_time) at time zone 'America/Sao_Paulo'
          - make_interval(mins=>e.reminder_minutes)
      ) = p_due_at
  );
$$;
revoke all on function public.sync_agenda_push_notifications(uuid) from public,anon,authenticated;
revoke all on function public.is_valid_agenda_push_notification(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.is_valid_agenda_push_notification(uuid,uuid,timestamptz) to service_role;
