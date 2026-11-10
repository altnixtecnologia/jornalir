-- Catálogo editorial enxuto: Fotos e vídeos é uma entrega única.
-- Preserva tarefas históricas gravadas como Fotografias, Vídeos ou Mídias;
-- altera só o rótulo aceito nas NOVAS escalas.
create or replace function public.create_coverage_team(
 p_event_id uuid,p_staff jsonb,p_article_owner uuid,
 p_audible integer default 60,p_checkin integer default 5
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_first uuid;v_first_label text;v_row record;v_task record;
 v_tasks jsonb;v_label text;v_kind text;v_seen text[];v_count int;
begin
 if auth.uid() is null or not public.is_agenda_manager() then
  raise exception 'Sem permissão para designar equipe' using errcode='42501';end if;
 if p_staff is null or jsonb_typeof(p_staff)<>'array' or
   jsonb_array_length(p_staff) not between 1 and 16 then
  raise exception 'Escolha entre 1 e 16 colaboradores';end if;
 if not exists(select 1 from public.profiles p where p.id=p_article_owner and p.active)
 then raise exception 'Redator inválido';end if;
 select count(distinct (x->>'profileId')::uuid) into v_count
   from jsonb_array_elements(p_staff) x;
 if v_count<>jsonb_array_length(p_staff) then
   raise exception 'Colaborador repetido';end if;
 for v_row in select x as item from jsonb_array_elements(p_staff) x loop
   if not exists(select 1 from public.profiles p
    where p.id=(v_row.item->>'profileId')::uuid and p.active) then
     raise exception 'Colaborador inválido ou inativo';end if;
   v_tasks:=v_row.item->'tasks';
   if jsonb_typeof(v_tasks) is distinct from 'array' then
     v_tasks:=jsonb_build_array(jsonb_build_object('kind','custom','label',v_row.item->>'task'));
   end if;
   if jsonb_array_length(v_tasks) not between 1 and 8 then
     raise exception 'Escolha de 1 a 8 tarefas por colaborador';end if;
   v_seen:=array[]::text[];
   for v_task in select x as item from jsonb_array_elements(v_tasks) x loop
     v_kind:=coalesce(v_task.item->>'kind','');
     v_label:=btrim(coalesce(v_task.item->>'label',''));
     if v_kind not in ('photos','video','interviews','audio','research','live','media','custom') or
       length(v_label) not between 2 and 80 or lower(v_label)=any(v_seen)
     or (v_kind<>'custom' and v_label is distinct from
     case v_kind
      when 'photos' then 'Fotografias'
      when 'video' then 'Vídeos'
      when 'interviews' then 'Entrevistas'
      when 'audio' then 'Captação de áudio'
      when 'research' then 'Apuração de informações'
      when 'live' then 'Transmissão ao vivo'
      when 'media' then 'Fotos e vídeos'
      else null end) then
       raise exception 'Tarefa inválida ou duplicada';end if;
     v_seen:=array_append(v_seen,lower(v_label));
   end loop;
 end loop;
 select (x->>'profileId')::uuid,
   btrim(coalesce(x->'tasks'->0->>'label',x->>'task'))
 into v_first,v_first_label from jsonb_array_elements(p_staff) x limit 1;
 perform public.create_coverage_for_event_with_task(
    p_event_id,v_first,p_article_owner,p_audible,p_checkin,v_first_label);
 update public.event_coverages set team_mode=true where event_id=p_event_id;
 for v_row in select x as item from jsonb_array_elements(p_staff) x loop
   v_tasks:=v_row.item->'tasks';
   if jsonb_typeof(v_tasks) is distinct from 'array' then
     v_tasks:=jsonb_build_array(jsonb_build_object('kind','custom','label',v_row.item->>'task'));
   end if;
   insert into public.event_coverage_members(event_id,profile_id,field_task,assigned_by)
   values(p_event_id,(v_row.item->>'profileId')::uuid,btrim(v_tasks->0->>'label'),auth.uid());
   for v_task in select x as item from jsonb_array_elements(v_tasks) x loop
     insert into public.event_coverage_member_tasks(
       event_id,profile_id,task_kind,task_label,assigned_by)
     values(p_event_id,(v_row.item->>'profileId')::uuid,
       v_task.item->>'kind',btrim(v_task.item->>'label'),auth.uid());
   end loop;
   insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
   values(p_event_id,(v_row.item->>'profileId')::uuid,'responsible')
   on conflict(event_id,profile_id) do nothing;
   perform public.notify_coverage_assignment(p_event_id,(v_row.item->>'profileId')::uuid,'initial');
 end loop;
 if not exists(select 1 from public.event_coverage_members
  where event_id=p_event_id and profile_id=p_article_owner) then
  insert into public.event_coverage_members(
    event_id,profile_id,assigned_by,attendance_response,attendance_responded_at)
  values(p_event_id,p_article_owner,auth.uid(),'not_required',now());
  perform public.notify_coverage_assignment(p_event_id,p_article_owner,'article');
 end if;
 perform public.reconcile_coverage_team(p_event_id);
 return p_event_id;
end;$$;

create or replace function public.assign_coverage_member_tasks(
 p_event_id uuid,p_profile_id uuid,p_tasks jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype;v_task record;
 v_seen text[]:=array[]::text[];v_label text;v_kind text;
 v_exists boolean;
begin
 if auth.uid() is null or not public.is_agenda_manager() then
  raise exception 'Somente gestor pode atribuir tarefas' using errcode='42501';end if;
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found or not v_c.team_mode then raise exception 'Equipe indisponível';end if;
 if p_tasks is null or jsonb_typeof(p_tasks)<>'array' or
     jsonb_array_length(p_tasks) not between 1 and 8 then
   raise exception 'Escolha entre 1 e 8 tarefas';end if;
 if not exists(select 1 from public.profiles p where id=p_profile_id and active) then
   raise exception 'Colaborador inválido';end if;
 select exists(select 1 from public.event_coverage_members
  where event_id=p_event_id and profile_id=p_profile_id) into v_exists;
 if (select count(*) from public.event_coverage_member_tasks
    where event_id=p_event_id and profile_id=p_profile_id)
      + jsonb_array_length(p_tasks)>8 then
   raise exception 'Cada colaborador pode ter no máximo 8 entregas';end if;
 if not v_exists and (select count(*) from public.event_coverage_members
    where event_id=p_event_id and field_task is not null)>=16 then
  raise exception 'Limite de colaboradores atingido';end if;
 for v_task in select x as item from jsonb_array_elements(p_tasks) x loop
   v_kind:=coalesce(v_task.item->>'kind','');
   v_label:=btrim(coalesce(v_task.item->>'label',''));
   if v_kind not in ('photos','video','interviews','audio','research','live','media','custom')
    or length(v_label) not between 2 and 80 or lower(v_label)=any(v_seen)
     or (v_kind<>'custom' and v_label is distinct from
     case v_kind
      when 'photos' then 'Fotografias'
      when 'video' then 'Vídeos'
      when 'interviews' then 'Entrevistas'
      when 'audio' then 'Captação de áudio'
      when 'research' then 'Apuração de informações'
      when 'live' then 'Transmissão ao vivo'
      when 'media' then 'Fotos e vídeos'
      else null end) then
     raise exception 'Tarefa inválida ou duplicada';end if;
   v_seen:=array_append(v_seen,lower(v_label));
 end loop;
 if not v_exists then
   insert into public.event_coverage_members(event_id,profile_id,field_task,assigned_by)
   values(p_event_id,p_profile_id,btrim(p_tasks->0->>'label'),auth.uid());
 else
   update public.event_coverage_members
   set field_task=coalesce(field_task,btrim(p_tasks->0->>'label')),
    field_completed_at=null,
    attendance_response=case when field_task is null
      then 'pending' else attendance_response end,
    attendance_responded_at=case when field_task is null
      then null else attendance_responded_at end,updated_at=now()
   where event_id=p_event_id and profile_id=p_profile_id;
 end if;
 for v_task in select x as item from jsonb_array_elements(p_tasks) x loop
  insert into public.event_coverage_member_tasks(
    event_id,profile_id,task_kind,task_label,assigned_by)
  values(p_event_id,p_profile_id,v_task.item->>'kind',
    btrim(v_task.item->>'label'),auth.uid());
 end loop;
 insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
 values(p_event_id,p_profile_id,'responsible')
 on conflict(event_id,profile_id) do nothing;
 perform public.notify_coverage_assignment(p_event_id,p_profile_id,
   case when v_exists then 'new-task:' else 'new-person:' end||now()::text);
 perform public.reconcile_coverage_team(p_event_id);
 return true;
end;$$;
