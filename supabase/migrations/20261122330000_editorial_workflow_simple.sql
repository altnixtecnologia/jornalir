-- Agenda editorial simples: Evento, Sessão da Câmara, Visita e Só matéria.
-- A data de entrega editorial é independente da semana em que a pauta nasceu.
alter table public.weekly_pauta_items drop constraint if exists weekly_pauta_due_reasonable;
-- Amplia estruturas existentes; não recria banco de pautas/agenda nem muda dados legados.
alter table public.agenda_events
 add column workflow_kind text not null default 'general'
   check (workflow_kind in ('general','event','council','visit','article')),
 add column council_city text,
 add column article_owner_id uuid references public.profiles(id),
 add column article_due_at timestamptz,
 add column article_due_time_explicit boolean not null default false,
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
      else (p_due_date+coalesce(p_due_time,time '23:59'))
        at time zone 'America/Sao_Paulo' end,
    article_due_time_explicit=(p_due_time is not null),
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

-- Impede o botão antigo de concluir uma cobertura sem registrar faltas de resposta.
create or replace function public.guard_editorial_workflow_close()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.workflow_kind<>'general'
  and new.status='completed' and old.status<>'completed'
  and (new.workflow_closed_at is null or new.workflow_closed_by is null) then
   raise exception 'Use Concluir matéria ou Encerrar compromisso para registrar as presenças';
 end if;
 return new;
end;$$;
drop trigger if exists guard_editorial_workflow_close on public.agenda_events;
create trigger guard_editorial_workflow_close
 before update of status on public.agenda_events
 for each row execute function public.guard_editorial_workflow_close();


-- Sem criar duplicata: converte um compromisso que já existe em um dos fluxos.
-- Preserva o ID, a Pauta vinculada e os registros da Agenda.
create or replace function public.activate_editorial_workflow(
 p_event_id uuid,p_kind text,p_city text,p_crew jsonb,p_writer uuid,
 p_due_date date,p_due_time time
) returns boolean language plpgsql security definer set search_path='' as $$
declare e public.agenda_events%rowtype;v_row record;v_task record;
 v_id uuid;v_ids uuid[]:=array[]::uuid[];v_tasks jsonb;v_seen text[];v_label text;v_kind text;
 v_attends boolean;v_existing uuid;v_week date;
begin
 if not public.can_manage_editorial_workflow() then raise exception 'Sem permissão' using errcode='42501';end if;
 if p_kind not in('event','council','visit') then raise exception 'Tipo inválido';end if;
 select * into e from public.agenda_events where id=p_event_id for update;
 if not found or e.status<>'scheduled' or e.workflow_kind<>'general' or
   exists(select 1 from public.event_coverages where event_id=p_event_id) then
   raise exception 'Compromisso não pode ser convertido sem preservar a cobertura existente';end if;
 if p_kind='council' and p_city not in(
 'Morrinhos do Sul/RS','Mampituba/RS','Praia Grande/SC','São João do Sul/SC',
 'Santa Rosa do Sul/SC','Torres/RS','Passo de Torres/SC') then raise exception 'Município inválido';end if;
 if p_kind<>'council' and p_city is not null then raise exception 'Município inválido';end if;
 if p_due_time is not null and p_due_date is null then raise exception 'Data do prazo ausente';end if;
 if p_crew is null or jsonb_typeof(p_crew)<>'array' or jsonb_array_length(p_crew) not between 1 and 16 then
  raise exception 'Informe os colaboradores';end if;
 for v_row in select value as item from jsonb_array_elements(p_crew) loop
  begin v_id:=(v_row.item->>'profileId')::uuid;
  exception when others then raise exception 'Colaborador inválido';end;
  if v_id is null or v_id=any(v_ids) or not exists(
    select 1 from public.profiles p where p.id=v_id and p.active) then
    raise exception 'Colaborador repetido ou inativo';end if;
  v_ids:=array_append(v_ids,v_id);
  v_tasks:=coalesce(v_row.item->'tasks','[]'::jsonb);
  if jsonb_typeof(v_tasks)<>'array' or jsonb_array_length(v_tasks)>8 then raise exception 'Tarefas inválidas';end if;
  v_seen:=array[]::text[];
  for v_task in select value as item from jsonb_array_elements(v_tasks) loop
    v_kind:=v_task.item->>'kind';v_label:=btrim(coalesce(v_task.item->>'label',''));
    if length(v_label) not between 2 and 80 or lower(v_label)=any(v_seen) or
      (v_kind='media' and v_label<>'Fotos e vídeos') or
      (v_kind='interviews' and v_label<>'Entrevistas') or
      (v_kind='live' and v_label<>'Transmissão') or
      (v_kind='research' and v_label<>'Apuração de informações') or
      v_kind not in('media','interviews','live','research','custom') then
      raise exception 'Tarefa inválida';end if;
    v_seen:=array_append(v_seen,lower(v_label));
  end loop;
 end loop;
 if p_writer is not null and not p_writer=any(v_ids) then raise exception 'Selecione o redator entre os escalados';end if;
 select id into v_existing from public.weekly_pauta_items where agenda_event_id=p_event_id limit 1;
 if v_existing is not null and p_writer is null then
   raise exception 'Há uma Pauta vinculada. Selecione quem fará a matéria';end if;
 update public.agenda_events set
  workflow_kind=p_kind,council_city=p_city,article_owner_id=p_writer,
  article_due_at=case when p_due_date is null then null else
    (p_due_date+coalesce(p_due_time,time '23:59')) at time zone 'America/Sao_Paulo' end,
  article_due_time_explicit=p_due_time is not null,
  event_kind=case when p_writer is not null then 'editorial' else 'general' end,
  updated_by=auth.uid(),updated_at=now()
 where id=p_event_id;
 -- Substituir apenas a escala pendente (compromisso ainda não encerrado).
 delete from public.agenda_event_assignees
 where event_id=p_event_id and assignment_type='responsible' and
  profile_id<>all(v_ids) and completed_at is null;
 for v_row in select value as item from jsonb_array_elements(p_crew) loop
   v_id:=(v_row.item->>'profileId')::uuid;
   v_tasks:=coalesce(v_row.item->'tasks','[]'::jsonb);
   v_attends:=coalesce((v_row.item->>'attends')::boolean,true);
   insert into public.agenda_event_assignees(
    event_id,profile_id,assignment_type,workflow_tasks,attendance_response)
   values(p_event_id,v_id,'responsible',v_tasks,
    case when v_attends then 'pending' else 'not_required' end)
   on conflict(event_id,profile_id) do update set
     workflow_tasks=excluded.workflow_tasks,
     attendance_response=excluded.attendance_response,
     attendance_responded_at=null,attendance_marked_by=null;
 end loop;
 if p_writer is not null then
   if v_existing is null then
     v_week:=public.pauta_week_start(e.event_date);
     insert into public.weekly_pauta_items(
      week_start,title,description,due_date,due_time,responsible_profile_id,agenda_event_id)
     values(v_week,e.title,e.description,p_due_date,
       case when p_due_date is not null then p_due_time else null end,p_writer,p_event_id);
   else
     update public.weekly_pauta_items set responsible_profile_id=p_writer,
       due_date=p_due_date,due_time=case when p_due_date is not null then p_due_time else null end,
       updated_by=auth.uid(),updated_at=now() where id=v_existing;
   end if;
 end if;
 return true;
end;$$;
revoke all on function public.activate_editorial_workflow(uuid,text,text,jsonb,uuid,date,time) from public,anon;
grant execute on function public.activate_editorial_workflow(uuid,text,text,jsonb,uuid,date,time) to authenticated;

create or replace function public.adjust_editorial_workflow_task(
 p_event_id uuid,p_from uuid,p_kind text,p_label text,
 p_action text,p_to uuid,p_new_label text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.agenda_events%rowtype;v_tasks jsonb;v_dst jsonb;
 v_index integer;v_item jsonb;v_new jsonb;v_name text;
begin
 if not public.can_manage_editorial_workflow() then
   raise exception 'Somente administração pode alterar tarefas alheias' using errcode='42501';end if;
 select * into v_event from public.agenda_events where id=p_event_id for update;
 if not found or v_event.workflow_kind='general' or v_event.workflow_closed_at is not null then
   raise exception 'Compromisso encerrado ou inexistente';end if;
 if p_action not in('edit','move','delete') then raise exception 'Ação inválida';end if;
 select workflow_tasks into v_tasks from public.agenda_event_assignees
   where event_id=p_event_id and profile_id=p_from for update;
 if v_tasks is null then raise exception 'Colaborador não escalado';end if;
 select ordinality::integer-1,value into v_index,v_item
   from jsonb_array_elements(v_tasks) with ordinality
  where value->>'kind'=p_kind and value->>'label'=p_label limit 1;
 if v_index is null then raise exception 'Tarefa não encontrada';end if;
 if p_action='edit' then
   v_name:=btrim(coalesce(p_new_label,''));
   if length(v_name) not between 2 and 80 then raise exception 'Descrição inválida';end if;
   v_new:=jsonb_build_object('kind','custom','label',v_name);
 elsif p_action='move' then
   if p_to is null or p_to=p_from then raise exception 'Selecione outro colaborador';end if;
   select workflow_tasks into v_dst from public.agenda_event_assignees
    where event_id=p_event_id and profile_id=p_to for update;
   if v_dst is null then raise exception 'Destino não escalado';end if;
   if jsonb_array_length(v_dst)>=8 then raise exception 'Destino já tem oito funções';end if;
   if exists(select 1 from jsonb_array_elements(v_dst) item
     where lower(item->>'label')=lower(p_label)) then raise exception 'Tarefa duplicada no destino';end if;
   v_new:=v_item;
 end if;
 if p_action='edit' and exists(select 1 from jsonb_array_elements(v_tasks) item
    where lower(item->>'label')=lower(v_name) and item<>v_item) then
    raise exception 'Tarefa duplicada';end if;
 update public.agenda_event_assignees set workflow_tasks=v_tasks-v_index
   where event_id=p_event_id and profile_id=p_from;
 if p_action='edit' then
   update public.agenda_event_assignees set workflow_tasks=workflow_tasks||jsonb_build_array(v_new)
    where event_id=p_event_id and profile_id=p_from;
 elsif p_action='move' then
   update public.agenda_event_assignees set workflow_tasks=workflow_tasks||jsonb_build_array(v_new)
    where event_id=p_event_id and profile_id=p_to;
 end if;
 return true;
end;$$;
revoke all on function public.adjust_editorial_workflow_task(uuid,uuid,text,text,text,uuid,text)
 from public,anon;
grant execute on function public.adjust_editorial_workflow_task(uuid,uuid,text,text,text,uuid,text)
 to authenticated;


-- O responsável pela matéria prevalece para a Pauta. O trigger legado
-- escolhia o primeiro UUID da equipe e trocava o redator por engano.
create or replace function public.sync_pauta_primary_assignee()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event uuid;v_primary uuid;v_kind text;
begin
 v_event:=case when tg_op='DELETE' then old.event_id else new.event_id end;
 if tg_op='UPDATE' and old.event_id is distinct from new.event_id then
  raise exception 'Não é permitido mover atribuição por UPDATE';end if;
 select e.workflow_kind,e.article_owner_id into v_kind,v_primary
 from public.agenda_events e where e.id=v_event;
 if v_kind is null or v_kind='general' then
   select a.profile_id into v_primary from public.agenda_event_assignees a
    where a.event_id=v_event and a.assignment_type='responsible'
    order by a.profile_id limit 1;
 end if;
 update public.weekly_pauta_items
 set responsible_profile_id=v_primary
 where agenda_event_id=v_event and responsible_profile_id is distinct from v_primary;
 return coalesce(new,old);
end;$$;

-- Novo nome fixo curto para a função, sem reescrever tarefas históricas.
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
      when 'live' then 'Transmissão'
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
      when 'live' then 'Transmissão'
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
