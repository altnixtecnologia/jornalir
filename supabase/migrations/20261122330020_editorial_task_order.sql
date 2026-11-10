-- Ordem visual das funções do mesmo colaborador, nunca transfere titular.
-- A ordem é guardada no array JSONB já existente em agenda_event_assignees.
create or replace function public.reorder_editorial_workflow_tasks(
 p_event_id uuid,p_profile_id uuid,p_labels text[]
) returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_event public.agenda_events%rowtype;
 v_current jsonb;v_reordered jsonb;
 v_count integer;v_found integer;
begin
 if not public.can_manage_editorial_workflow() then
  raise exception 'Somente administração pode ordenar as funções' using errcode='42501';
 end if;
 select * into v_event from public.agenda_events where id=p_event_id for update;
 if not found or v_event.workflow_kind='general' or v_event.workflow_closed_at is not null then
  raise exception 'Compromisso indisponível ou encerrado';
 end if;
 select workflow_tasks into v_current
   from public.agenda_event_assignees
   where event_id=p_event_id and profile_id=p_profile_id for update;
 if v_current is null then raise exception 'Colaborador não escalado';end if;
 v_count:=jsonb_array_length(v_current);
 if coalesce(array_length(p_labels,1),0)<>v_count or
  (select count(distinct lower(x)) from unnest(p_labels) x)<>v_count then
  raise exception 'A ordem deve conter exatamente as funções existentes';
 end if;
 select jsonb_agg(t.item order by p.ordinality),count(*)::integer
  into v_reordered,v_found
  from unnest(p_labels) with ordinality as p(label,ordinality)
  cross join lateral (
   select j as item from jsonb_array_elements(v_current) j
    where j->>'label'=p.label limit 1
  ) t;
 if v_found<>v_count then raise exception 'Função desconhecida ou repetida na nova ordem';end if;
 if v_reordered is distinct from v_current then
  update public.agenda_event_assignees set workflow_tasks=v_reordered
   where event_id=p_event_id and profile_id=p_profile_id;
 end if;
 return true;
end;$$;
revoke all on function public.reorder_editorial_workflow_tasks(uuid,uuid,text[])
 from public,anon;
grant execute on function public.reorder_editorial_workflow_tasks(uuid,uuid,text[]) to authenticated;
