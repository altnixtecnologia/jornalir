-- Operacoes atomicas: recorrencia + responsaveis (evita gravacao parcial).
create or replace function public.create_agenda_occurrences(
 p_title text, p_description text, p_dates date[],
 p_start_time time, p_end_time time, p_location text,
 p_reminder_minutes integer, p_assignee_ids uuid[]
) returns integer language plpgsql security invoker set search_path = ''
as $$
declare occurrence_date date; new_event_id uuid; inserted integer := 0;
begin
 if not public.has_staff_module_access('agenda',true) then
   raise exception 'Sem permissao para editar a Agenda';
 end if;
 if cardinality(p_dates) not between 1 and 12 or array_position(p_dates,null) is not null then
   raise exception 'Recorrencia invalida';
 end if;
 if exists (
   select 1 from unnest(coalesce(p_assignee_ids,array[]::uuid[])) as a(id)
   left join public.profiles p on p.id = a.id and p.active
   where p.id is null
 ) then raise exception 'Responsavel inexistente ou inativo'; end if;
 foreach occurrence_date in array p_dates loop
   insert into public.agenda_events(title,description,event_date,start_time,end_time,location,reminder_minutes)
   values(p_title,p_description,occurrence_date,p_start_time,p_end_time,p_location,p_reminder_minutes)
   returning id into new_event_id;
   insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
   select new_event_id,a.id,'responsible' from (
     select distinct unnest(coalesce(p_assignee_ids,array[]::uuid[])) as id
   ) a;
   inserted := inserted + 1;
 end loop;
 return inserted;
end $$;

create or replace function public.replace_agenda_assignees(p_event_id uuid,p_profile_ids uuid[])
returns void language plpgsql security invoker set search_path = ''
as $$
begin
 if not public.has_staff_module_access('agenda',true) then
   raise exception 'Sem permissao para editar a Agenda';
 end if;
 if exists (
   select 1 from unnest(coalesce(p_profile_ids,array[]::uuid[])) as a(id)
   left join public.profiles p on p.id = a.id and p.active
   where p.id is null
 ) then raise exception 'Responsavel inexistente ou inativo'; end if;
 delete from public.agenda_event_assignees where event_id = p_event_id;
 insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
 select p_event_id,a.id,'responsible' from (
   select distinct unnest(coalesce(p_profile_ids,array[]::uuid[])) as id
 ) a;
end $$;

revoke all on function public.create_agenda_occurrences(text,text,date[],time,time,text,integer,uuid[]) from public,anon;
grant execute on function public.create_agenda_occurrences(text,text,date[],time,time,text,integer,uuid[]) to authenticated;
revoke all on function public.replace_agenda_assignees(uuid,uuid[]) from public,anon;
grant execute on function public.replace_agenda_assignees(uuid,uuid[]) to authenticated;
