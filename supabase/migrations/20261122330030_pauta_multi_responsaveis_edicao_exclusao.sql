-- Pauta: múltiplos responsáveis, edição e arquivamento controlado.
create or replace function public.create_editorial_workflow(
 p_kind text, p_title text, p_description text, p_event_date date,
 p_start_time time, p_end_time time, p_location text,
 p_week_start date, p_city text, p_crew jsonb, p_writer uuid,
 p_due_date date, p_due_time time, p_repeat integer default 1
) returns integer language plpgsql security definer set search_path='' as $$
declare
 v_index integer;v_occurrence date;v_event uuid;v_pauta uuid;v_week date;
 v_row record;v_task record;v_tasks jsonb;v_ids uuid[];v_id uuid;
 v_attends boolean;v_writer_present boolean;v_label text;v_kind text;
 v_seen text[];v_occ_due date;v_title text;v_workflow text;
begin
 if not public.can_manage_editorial_workflow() then
   raise exception 'Somente administração pode cadastrar compromissos editoriais' using errcode='42501';end if;
 if p_kind not in('event','council','visit','article') then
   raise exception 'Tipo de compromisso inválido';end if;
 if length(btrim(coalesce(p_title,''))) not between 1 and 180 or
    length(coalesce(p_description,''))>4000 or length(coalesce(p_location,''))>240 then
   raise exception 'Título, descrição ou local inválido';end if;
 if p_kind<>'article' and p_event_date is null then
   raise exception 'Informe a data do compromisso';end if;
 if p_end_time is not null and (p_start_time is null or p_end_time<p_start_time) then
   raise exception 'Horário final inválido';end if;
 if p_due_time is not null and p_due_date is null then
   raise exception 'Informe a data do prazo ou remova o horário';end if;
 if p_kind='article' and p_writer is null then
   raise exception 'A pauta precisa de um redator';end if;
 if p_kind='council' and p_city not in (
    'Morrinhos do Sul/RS','Mampituba/RS','Praia Grande/SC','São João do Sul/SC',
    'Santa Rosa do Sul/SC','Torres/RS','Passo de Torres/SC') then
   raise exception 'Selecione o município da sessão';end if;
 if p_kind<>'council' and p_city is not null then
   raise exception 'Município da Câmara não se aplica ao tipo escolhido';end if;
 if p_repeat not in(1,4,12) or (p_kind<>'council' and p_repeat<>1) then
   raise exception 'Repetição inválida';end if;
 if p_crew is null or jsonb_typeof(p_crew)<>'array' or
   jsonb_array_length(p_crew) not between 1 and 16 then
   raise exception 'Selecione entre 1 e 16 colaboradores';end if;
 v_ids:=array[]::uuid[];v_writer_present:=false;
 for v_row in select value as item from jsonb_array_elements(p_crew) loop
   begin v_id:=(v_row.item->>'profileId')::uuid;
   exception when others then raise exception 'Colaborador inválido';end;
   if v_id is null or v_id=any(v_ids) or not exists(
     select 1 from public.profiles p where p.id=v_id and p.active) then
     raise exception 'Colaborador duplicado ou inativo';end if;
   v_ids:=array_append(v_ids,v_id);
   if v_id=p_writer then v_writer_present:=true;end if;
   v_tasks:=coalesce(v_row.item->'tasks','[]'::jsonb);
   if jsonb_typeof(v_tasks)<>'array' or jsonb_array_length(v_tasks)>8 then
     raise exception 'Tarefas inválidas';end if;
   v_seen:=array[]::text[];
   for v_task in select value as item from jsonb_array_elements(v_tasks) loop
     v_kind:=coalesce(v_task.item->>'kind','');
     v_label:=btrim(coalesce(v_task.item->>'label',''));
     if length(v_label) not between 2 and 80 or lower(v_label)=any(v_seen)
       or (v_kind='media' and v_label<>'Fotos e vídeos')
       or (v_kind='interviews' and v_label<>'Entrevistas')
       or (v_kind='live' and v_label<>'Transmissão')
       or (v_kind='research' and v_label<>'Apuração de informações')
       or v_kind not in('media','interviews','live','research','custom') then
       raise exception 'Tarefa inválida ou duplicada';end if;
     v_seen:=array_append(v_seen,lower(v_label));
   end loop;
 end loop;
 if p_writer is not null and not v_writer_present then
   raise exception 'Marque Matéria em um dos colaboradores';end if;
 -- Para pauta simples: vários responsáveis, mantendo 1 referência primária de redação.
 if p_week_start is not null and public.pauta_week_start(p_week_start)<>p_week_start then
   raise exception 'Semana de edição inválida';end if;

 for v_index in 0..p_repeat-1 loop
   v_occurrence:=coalesce(p_event_date,p_week_start,(now() at time zone 'America/Sao_Paulo')::date)
      + v_index*7;
   v_occ_due:=case when p_due_date is not null then p_due_date+v_index*7 else null end;
   v_week:=case when p_kind='article' and p_week_start is not null
       then p_week_start else public.pauta_week_start(v_occurrence) end;
   if p_kind='council' and exists(
     select 1 from public.agenda_events e
     where e.workflow_kind='council' and e.council_city=p_city
       and e.event_date=v_occurrence and e.status<>'cancelled') then
     raise exception 'Já existe sessão cadastrada para este município e dia';end if;
   insert into public.agenda_events(
     title,description,event_date,start_time,end_time,location,event_kind,
     reminder_minutes,show_in_agenda,workflow_kind,council_city,article_owner_id,article_due_at,article_due_time_explicit
   ) values(
     btrim(p_title),p_description,v_occurrence,
     case when p_kind='article' then null else p_start_time end,
     case when p_kind='article' then null else p_end_time end,
     p_location,case when p_writer is not null then 'editorial' else 'general' end,
     case when p_start_time is not null and p_kind<>'article' then 30 else null end,
     p_kind<>'article',p_kind,p_city,p_writer,
     case when v_occ_due is null then null else
       (v_occ_due+coalesce(p_due_time,time '23:59')) at time zone 'America/Sao_Paulo'
     end,
     p_due_time is not null
   ) returning id into v_event;
   for v_row in select value as item from jsonb_array_elements(p_crew) loop
     v_id:=(v_row.item->>'profileId')::uuid;
     v_tasks:=coalesce(v_row.item->'tasks','[]'::jsonb);
     v_attends:=p_kind<>'article' and coalesce((v_row.item->>'attends')::boolean,true);
     insert into public.agenda_event_assignees(
       event_id,profile_id,assignment_type,workflow_tasks,attendance_response)
     values(v_event,v_id,'responsible',v_tasks,
       case when v_attends then 'pending' else 'not_required' end);
     insert into public.notification_events(
       app_kind,kind,target_profile_id,title,body,href,dedupe_key)
     values('sistema','agenda',v_id,
       case when v_id=p_writer then 'Matéria atribuída' else 'Compromisso na Agenda' end,
       btrim(p_title)||' · Confira suas responsabilidades.',
       case when p_kind='article' then '/sistema/pauta?date='||v_week
         else '/sistema/agenda?date='||v_occurrence end,
       'workflow:assigned:'||v_event||':'||v_id)
     on conflict(dedupe_key) do nothing;
   end loop;
   if p_writer is not null then
      insert into public.weekly_pauta_items(
       week_start,title,description,due_date,due_time,responsible_profile_id,agenda_event_id)
      values(v_week,btrim(p_title),p_description,v_occ_due,
       case when v_occ_due is not null then p_due_time else null end,
       p_writer,v_event) returning id into v_pauta;
   end if;
 end loop;
 return p_repeat;
end;$$;
revoke all on function public.create_editorial_workflow(text,text,text,date,time,time,text,date,text,jsonb,uuid,date,time,integer)
 from public,anon;
grant execute on function public.create_editorial_workflow(text,text,text,date,time,time,text,date,text,jsonb,uuid,date,time,integer)
 to authenticated;

-- Editar pauta simples com múltiplos responsáveis, preservando identidade/vínculo de registros.
create or replace function public.update_editorial_article_pauta(
 p_pauta_id uuid,p_title text,p_description text,p_profile_ids uuid[],
 p_due_date date,p_due_time time,p_expected_updated_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_pauta public.weekly_pauta_items%rowtype;
 v_event public.agenda_events%rowtype;
 v_id uuid;
begin
 if not public.can_manage_editorial_workflow() then
   raise exception 'Sem permissão para editar pauta' using errcode='42501';end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 180 or
    length(coalesce(p_description,''))>4000 then
   raise exception 'Título ou observações inválidos';end if;
 if p_due_time is not null and p_due_date is null then
   raise exception 'A hora exige uma data';end if;
 if p_profile_ids is null or cardinality(p_profile_ids) not between 1 and 16 or
    cardinality(array(select distinct unnest(p_profile_ids)))<>cardinality(p_profile_ids) then
   raise exception 'Selecione de 1 a 16 responsáveis diferentes';end if;
 if exists(select 1 from unnest(p_profile_ids) x(id)
    left join public.profiles p on p.id=x.id and p.active
    where x.id is null or p.id is null) then
   raise exception 'Responsável inválido ou inativo';end if;
 select * into v_pauta from public.weekly_pauta_items
    where id=p_pauta_id for update;
 if not found or v_pauta.agenda_event_id is null then
   raise exception 'Pauta indisponível';end if;
 select * into v_event from public.agenda_events
    where id=v_pauta.agenda_event_id for update;
 if not found or v_event.workflow_kind<>'article' or v_event.status='cancelled' then
   raise exception 'Apenas pautas simples ativas podem ser editadas';end if;
 if v_event.updated_at is distinct from p_expected_updated_at then
   raise exception 'Outra pessoa alterou a pauta. Atualize antes de salvar';end if;

 -- Manter todas as participações, sem exigir função na criação.
 foreach v_id in array p_profile_ids loop
   insert into public.agenda_event_assignees(
     event_id,profile_id,assignment_type,workflow_tasks,attendance_response)
   values(v_event.id,v_id,'responsible','[]'::jsonb,'not_required')
   on conflict(event_id,profile_id) do nothing;
 end loop;
 delete from public.agenda_event_assignees
    where event_id=v_event.id and assignment_type='responsible'
      and not (profile_id=any(p_profile_ids));

 update public.agenda_events set
   title=btrim(p_title),description=p_description,
   article_owner_id=p_profile_ids[1],
   article_due_at=case when p_due_date is null then null else
     (p_due_date+coalesce(p_due_time,time '23:59')) at time zone 'America/Sao_Paulo' end,
   article_due_time_explicit=(p_due_time is not null),
   updated_by=auth.uid(),updated_at=now()
   where id=v_event.id;
 update public.weekly_pauta_items set
   title=btrim(p_title),description=p_description,
   due_date=p_due_date,due_time=p_due_time,
   responsible_profile_id=p_profile_ids[1],updated_at=now()
   where id=v_pauta.id;
 return true;
end;$$;
revoke all on function public.update_editorial_article_pauta(uuid,text,text,uuid[],date,time,timestamptz)
 from public,anon;
grant execute on function public.update_editorial_article_pauta(uuid,text,text,uuid[],date,time,timestamptz)
 to authenticated;

-- Exclusão lógica reversível administrativamente. Não apaga matérias nem logs.
create or replace function public.archive_editorial_article_pauta(
 p_pauta_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_pauta public.weekly_pauta_items%rowtype;v_event public.agenda_events%rowtype;
begin
 if not public.can_manage_editorial_workflow() then
    raise exception 'Sem permissão para excluir pauta' using errcode='42501';end if;
 select * into v_pauta from public.weekly_pauta_items
    where id=p_pauta_id for update;
 if not found or v_pauta.agenda_event_id is null then
    raise exception 'Pauta não encontrada';end if;
 select * into v_event from public.agenda_events
    where id=v_pauta.agenda_event_id for update;
 if not found or v_event.workflow_kind<>'article' then
    raise exception 'Esta ação exclui apenas pautas simples';end if;
 update public.agenda_events set status='cancelled',completed_at=null,
   updated_by=auth.uid(),updated_at=now() where id=v_event.id;
 update public.weekly_pauta_items set status='cancelled',completed_at=null,updated_at=now()
   where id=v_pauta.id;
 return true;
end;$$;
revoke all on function public.archive_editorial_article_pauta(uuid) from public,anon;
grant execute on function public.archive_editorial_article_pauta(uuid) to authenticated;

