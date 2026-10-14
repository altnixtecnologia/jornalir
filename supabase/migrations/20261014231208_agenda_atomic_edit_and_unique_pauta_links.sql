-- Agenda: edição do compromisso e responsáveis na mesma transação.
create or replace function public.update_agenda_event_with_assignees(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_location text,
  p_reminder_minutes integer,
  p_profile_ids uuid[]
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.has_staff_module_access('agenda', true) then
    raise exception 'Sem permissão para editar a Agenda';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_profile_ids, array[]::uuid[])) x(id)
    left join public.profiles p on p.id = x.id and p.active
    where p.id is null
  ) then
    raise exception 'Responsável inexistente ou inativo';
  end if;
  update public.agenda_events set
    title = p_title,
    description = p_description,
    event_date = p_event_date,
    start_time = p_start_time,
    end_time = p_end_time,
    location = p_location,
    reminder_minutes = p_reminder_minutes
  where id = p_event_id
  returning id into v_id;
  if v_id is null then
    raise exception 'Compromisso não encontrado ou sem permissão';
  end if;
  delete from public.agenda_event_assignees where event_id = p_event_id;
  insert into public.agenda_event_assignees (event_id, profile_id, assignment_type)
  select p_event_id, ids.id, 'responsible'
  from (select distinct unnest(coalesce(p_profile_ids, array[]::uuid[])) as id) ids;
  return true;
end
$$;
revoke all on function public.update_agenda_event_with_assignees(uuid,text,text,date,time,time,text,integer,uuid[]) from public,anon;
grant execute on function public.update_agenda_event_with_assignees(uuid,text,text,date,time,time,text,integer,uuid[]) to authenticated;

-- Impede vínculos duplicados inclusive sob requisições simultâneas.
create unique index if not exists weekly_pauta_one_active_per_event
  on public.weekly_pauta_items (agenda_event_id)
  where agenda_event_id is not null and status <> 'cancelled';
create unique index if not exists weekly_pauta_one_per_article
  on public.weekly_pauta_items (article_id)
  where article_id is not null;
