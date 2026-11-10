-- Agenda editorial simples: Evento, Sessão da Câmara, Visita e Só matéria.
-- Amplia estruturas existentes; não recria banco de pautas/agenda nem muda dados legados.
alter table public.agenda_events
 add column workflow_kind text not null default 'general'
   check (workflow_kind in ('general','event','council','visit','article')),
 add column council_city text,
 add column article_owner_id uuid references public.profiles(id),
 add column article_due_at timestamptz,
 add column article_completed_at timestamptz,
 add column article_completed_by uuid references public.profiles(id),
 add column workflow_closed_at timestamptz,
 add column workflow_closed_by uuid references public.profiles(id);

alter table public.agenda_events add constraint council_city_valid check (
 council_city is null or council_city in (
 'Morrinhos do Sul/RS','Mampituba/RS','Praia Grande/SC','São João do Sul/SC',
 'Santa Rosa do Sul/SC','Torres/RS','Passo de Torres/SC'
 ));
alter table public.agenda_events add constraint council_city_only_for_council check (
 workflow_kind='council' or council_city is null
);

alter table public.agenda_event_assignees
 add column workflow_tasks jsonb not null default '[]'::jsonb
   check (jsonb_typeof(workflow_tasks)='array' and jsonb_array_length(workflow_tasks)<=8),
 add column attendance_response text not null default 'pending'
   check (attendance_response in ('pending','present','absent','not_required','unconfirmed')),
 add column attendance_responded_at timestamptz,
 add column attendance_marked_by uuid references public.profiles(id);

-- Admin/owner pode ajustar baixa alheia; demais usuários apenas a própria.
create or replace function public.can_manage_editorial_workflow()
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and public.is_active_staff()
 and exists(select 1 from public.profiles p where p.id=(select auth.uid())
 and p.active and p.role in('owner','admin'))
$$;
revoke all on function public.can_manage_editorial_workflow() from public,anon;
grant execute on function public.can_manage_editorial_workflow() to authenticated;

-- Cria a Agenda e a Pauta na mesma transação. Matéria sem prazo fica sem vencimento.
-- Os dados da presença e o trabalho editorial permanecem independentes.
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
 if p_kind='article' and jsonb_array_length(p_crew)<>1 then
   raise exception 'Só matéria deve ter um responsável';end if;
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
     reminder_minutes,show_in_agenda,workflow_kind,council_city,article_owner_id,article_due_at
   ) values(
     btrim(p_title),p_description,v_occurrence,
     case when p_kind='article' then null else p_start_time end,
     case when p_kind='article' then null else p_end_time end,
     p_location,case when p_writer is not null then 'editorial' else 'general' end,
     case when p_start_time is not null and p_kind<>'article' then 30 else null end,
     p_kind<>'article',p_kind,p_city,p_writer,
     case when v_occ_due is null then null else
       (v_occ_due::timestamp+coalesce(p_due_time,time '23:59')) at time zone 'America/Sao_Paulo'
     end
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

-- Um toque por usuário; admin pode corrigir qualquer pessoa sem assumir sua identidade.
create or replace function public.answer_editorial_workflow_presence(
 p_event_id uuid,p_profile_id uuid,p_answer text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.agenda_events%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 if p_answer not in('present','absent','not_required') then
  raise exception 'Resposta inválida';end if;
 select * into v_event from public.agenda_events where id=p_event_id for update;
 if not found or v_event.workflow_kind='general' then
  raise exception 'Compromisso não encontrado';end if;
 if v_event.workflow_closed_at is not null and not public.can_manage_editorial_workflow() then
  raise exception 'Cobertura encerrada; solicite correção à administração';end if;
 if p_profile_id<>auth.uid() and not public.can_manage_editorial_workflow() then
  raise exception 'Cada pessoa responde sua própria presença' using errcode='42501';end if;
 update public.agenda_event_assignees set attendance_response=p_answer,
  attendance_responded_at=now(),attendance_marked_by=auth.uid()
 where event_id=p_event_id and profile_id=p_profile_id
   and (attendance_response<>'not_required' or public.can_manage_editorial_workflow());
 if not found then raise exception 'Colaborador não escalado ou dispensado';end if;
 return true;
end;$$;
revoke all on function public.answer_editorial_workflow_presence(uuid,uuid,text) from public,anon;
grant execute on function public.answer_editorial_workflow_presence(uuid,uuid,text) to authenticated;

-- O redator (ou administração) encerra tudo. Quem não respondeu fica
-- "Não confirmou", NUNCA "Não compareceu" automaticamente.
create or replace function public.close_editorial_workflow(
 p_event_id uuid,p_completed boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.agenda_events%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 select * into v_event from public.agenda_events where id=p_event_id for update;
 if not found or v_event.workflow_kind='general' or v_event.status='cancelled' then
  raise exception 'Compromisso inválido';end if;
 if auth.uid() is distinct from v_event.article_owner_id
    and not public.can_manage_editorial_workflow() then
  raise exception 'Somente redator ou administração pode encerrar' using errcode='42501';end if;
 if p_completed then
   update public.agenda_event_assignees set
     attendance_response='unconfirmed'
   where event_id=p_event_id and attendance_response='pending';
 else
   update public.agenda_event_assignees set
     attendance_response='pending'
   where event_id=p_event_id and attendance_response='unconfirmed';
 end if;
 update public.agenda_events set
   status=case when p_completed then 'completed' else 'scheduled' end,
   completed_at=case when p_completed then coalesce(completed_at,now()) else null end,
   article_completed_at=case when p_completed and article_owner_id is not null
     then coalesce(article_completed_at,now()) else null end,
   article_completed_by=case when p_completed and article_owner_id is not null
     then auth.uid() else null end,
   workflow_closed_at=case when p_completed then coalesce(workflow_closed_at,now()) else null end,
   workflow_closed_by=case when p_completed then auth.uid() else null end,
   updated_by=auth.uid(),updated_at=now()
 where id=p_event_id;
 update public.weekly_pauta_items set
   status=case when p_completed then 'completed' else 'pending' end,
   completed_at=case when p_completed then coalesce(completed_at,now()) else null end,
   completed_by=case when p_completed then auth.uid() else null end,
   updated_by=auth.uid(),updated_at=now()
 where agenda_event_id=p_event_id and status<>'cancelled';
 return true;
end;$$;
revoke all on function public.close_editorial_workflow(uuid,boolean) from public,anon;
grant execute on function public.close_editorial_workflow(uuid,boolean) to authenticated;

create or replace function public.update_editorial_workflow_deadline(
 p_event_id uuid,p_due_date date,p_due_time time
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.agenda_events%rowtype;
begin
 if not public.is_active_staff() or auth.uid() is null then
   raise exception 'Sem acesso' using errcode='42501';end if;
 select * into v_event from public.agenda_events where id=p_event_id for update;
 if not found or v_event.workflow_kind='general' or v_event.article_owner_id is null then
   raise exception 'Matéria não encontrada';end if;
 if auth.uid()<>v_event.article_owner_id and not public.can_manage_editorial_workflow() then
   raise exception 'Sem permissão para alterar prazo' using errcode='42501';end if;
 if p_due_date is null and p_due_time is not null then
   raise exception 'Informe data ou limpe o horário';end if;
 update public.agenda_events set
    article_due_at=case when p_due_date is null then null
      else (p_due_date::timestamp+coalesce(p_due_time,time '23:59'))
        at time zone 'America/Sao_Paulo' end,
    updated_by=auth.uid(),updated_at=now()
 where id=p_event_id;
 update public.weekly_pauta_items set due_date=p_due_date,
   due_time=case when p_due_date is not null then p_due_time else null end,
   updated_by=auth.uid(),updated_at=now()
 where agenda_event_id=p_event_id and status<>'cancelled';
 return true;
end;$$;
revoke all on function public.update_editorial_workflow_deadline(uuid,date,time) from public,anon;
grant execute on function public.update_editorial_workflow_deadline(uuid,date,time) to authenticated;

-- Não transformar horário da sessão em prazo da matéria, inclusive ao editar.
create or replace function public.sync_pauta_snapshot_from_agenda()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_kind<>'editorial' then return new;end if;
 if new.workflow_kind<>'general' then
    update public.weekly_pauta_items p set
      title=new.title,description=new.description,
      status=case when new.status='completed' then 'completed'
        when new.status='cancelled' then 'cancelled' else 'pending' end,
      completed_at=case when new.status='completed' then new.completed_at else null end,
      completed_by=case when new.status='completed'
        then coalesce(p.completed_by,new.workflow_closed_by,auth.uid()) else null end
    where p.agenda_event_id=new.id;
    return new;
 end if;
 if (new.title,new.description,new.event_date,new.start_time,new.status,new.completed_at)
    is not distinct from
    (old.title,old.description,old.event_date,old.start_time,old.status,old.completed_at)
    and new.event_kind is not distinct from old.event_kind then return new;end if;
 update public.weekly_pauta_items p set
  title=new.title,description=new.description,due_date=new.event_date,due_time=new.start_time,
  week_start=case when exists(select 1 from public.pauta_week_overrides o
    where o.week_start=p.week_start and new.event_date between o.period_start and o.period_end)
    then p.week_start else public.pauta_week_start(new.event_date) end,
  status=case when exists(select 1 from public.event_coverages c
     where c.event_id=new.id and c.team_mode) then p.status
    when new.status='completed' then 'completed'
    when new.status='cancelled' then 'cancelled' else 'pending' end,
  completed_at=case when exists(select 1 from public.event_coverages c
     where c.event_id=new.id and c.team_mode) then p.completed_at else new.completed_at end,
  completed_by=case when exists(select 1 from public.event_coverages c
     where c.event_id=new.id and c.team_mode) then p.completed_by
    when new.status='completed' then coalesce(p.completed_by,auth.uid()) else null end
 where p.id=(select q.id from public.weekly_pauta_items q where q.agenda_event_id=new.id
  order by case when q.status='cancelled' then 1 else 0 end,q.created_at desc limit 1);
 return new;
end;$$;

-- Menos alertas: apenas prazos editoriais expressamente preenchidos.
-- O fechamento registra "Não confirmou"; ausência de resposta não bloqueia.
