-- Pauta/Agenda: compatibilidade com as duas origens de pauta.
-- A Semana da Pauta, edição e horário individual são independentes.
-- Alterações existentes em páginas, contratos, notificações e NFS-e preservadas.

create table if not exists public.pauta_edition_overrides(
  week_start date primary key,
  edition_number integer not null check (edition_number between 1 and 99999),
  reason text not null default 'Ajuste manual',
  created_by uuid not null references public.profiles(id) default auth.uid(),
  updated_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pauta_edition_week_thursday check (extract(isodow from week_start)=4)
);
alter table public.pauta_edition_overrides enable row level security;
revoke all on public.pauta_edition_overrides from public,anon,authenticated;
grant select on public.pauta_edition_overrides to authenticated;
create policy pauta_edition_read_staff on public.pauta_edition_overrides
  for select to authenticated using(public.has_staff_module_access('pauta',false));

create or replace function public.save_pauta_edition_override(
 p_week_start date,p_edition_number integer,p_reason text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.is_agenda_manager() then raise exception 'Sem permissão para alterar edição' using errcode='42501';end if;
 if p_week_start is null or public.pauta_week_start(p_week_start)<>p_week_start then
  raise exception 'Semana editorial inválida';end if;
 if p_edition_number is null then
  delete from public.pauta_edition_overrides where week_start=p_week_start;
  return true;
 end if;
 if p_edition_number not between 1 and 99999 then raise exception 'Número de edição inválido';end if;
 insert into public.pauta_edition_overrides(week_start,edition_number,reason,created_by,updated_by)
 values(p_week_start,p_edition_number,coalesce(nullif(btrim(p_reason),''),'Ajuste manual'),auth.uid(),auth.uid())
 on conflict(week_start) do update set edition_number=excluded.edition_number,
  reason=excluded.reason,updated_by=auth.uid(),updated_at=now();
 return true;
end;$$;
revoke all on function public.save_pauta_edition_override(date,integer,text) from public,anon;
grant execute on function public.save_pauta_edition_override(date,integer,text) to authenticated;

-- Cada responsável possui compromisso pessoal independente da pauta e da equipe.
create table if not exists public.pauta_agenda_appointments(
 pauta_id uuid not null references public.weekly_pauta_items(id) on delete restrict,
 profile_id uuid not null references public.profiles(id),
 event_id uuid not null unique references public.agenda_events(id) on delete restrict,
 created_by uuid not null references public.profiles(id) default auth.uid(),
 created_at timestamptz not null default now(),
 primary key(pauta_id,profile_id)
);
create index if not exists pauta_agenda_appointments_event_idx on public.pauta_agenda_appointments(event_id);
alter table public.pauta_agenda_appointments enable row level security;
revoke all on public.pauta_agenda_appointments from public,anon,authenticated;
grant select on public.pauta_agenda_appointments to authenticated;
create policy pauta_agenda_appointments_read_staff on public.pauta_agenda_appointments
 for select to authenticated using(
  public.has_staff_module_access('agenda',false) or public.has_staff_module_access('pauta',false)
 );

create or replace function public.create_pauta_agenda_appointments(
 p_pauta_id uuid,p_profile_ids uuid[],p_event_date date,p_start_time time without time zone,
 p_reminder_minutes integer default 30
) returns integer language plpgsql security definer set search_path='' as $$
declare
 v_pauta public.weekly_pauta_items%rowtype;
 v_parent uuid;v_event uuid;v_profile uuid;v_created integer:=0;
begin
 if not public.is_agenda_manager() then raise exception 'Sem permissão para agendar' using errcode='42501';end if;
 if p_event_date is null or p_start_time is null or
    (p_reminder_minutes is null or p_reminder_minutes not in (0,5,10,15,30,60,120,1440)) then
  raise exception 'Informe data, horário e lembrete válido';end if;
 if p_profile_ids is null or cardinality(p_profile_ids) not between 1 and 16
    or cardinality(array(select distinct unnest(p_profile_ids)))<>cardinality(p_profile_ids) then
  raise exception 'Selecione de 1 a 16 participantes distintos';end if;
 select * into v_pauta from public.weekly_pauta_items
  where id=p_pauta_id for update;
 if not found or v_pauta.status='cancelled' then raise exception 'Pauta inexistente ou excluída';end if;
 v_parent:=v_pauta.agenda_event_id;
 foreach v_profile in array p_profile_ids loop
   if v_profile is null or not exists(
     select 1 from public.agenda_event_assignees a
     join public.profiles p on p.id=a.profile_id
     where a.event_id=v_parent and a.profile_id=v_profile and p.active) then
     raise exception 'Colaborador não pertence à pauta ou está inativo';end if;
   if not exists(select 1 from public.pauta_agenda_appointments x where x.pauta_id=p_pauta_id and x.profile_id=v_profile) then
     insert into public.agenda_events(
      title,description,event_date,start_time,end_time,location,
      event_kind,workflow_kind,show_in_agenda,reminder_minutes
     ) values(
      v_pauta.title,'Compromisso pessoal vinculado à Pauta',p_event_date,p_start_time,null,null,
      'general','general',true,p_reminder_minutes
     ) returning id into v_event;
     insert into public.agenda_event_assignees(event_id,profile_id,assignment_type,attendance_response)
       values(v_event,v_profile,'responsible','not_required');
     insert into public.pauta_agenda_appointments(pauta_id,profile_id,event_id)
       values(p_pauta_id,v_profile,v_event);
     v_created:=v_created+1;
   end if;
 end loop;
 return v_created;
end;$$;
revoke all on function public.create_pauta_agenda_appointments(uuid,uuid[],date,time without time zone,integer) from public,anon;
grant execute on function public.create_pauta_agenda_appointments(uuid,uuid[],date,time without time zone,integer) to authenticated;

-- Apenas o próprio colaborador (ou gerente) altera seu compromisso pessoal.
-- Não modifica a pauta, nem responsáveis de outros compromissos.
create or replace function public.update_pauta_agenda_appointment(
 p_event_id uuid,p_title text,p_description text,p_event_date date,
 p_start_time time without time zone,p_end_time time without time zone,
 p_location text,p_reminder_minutes integer,p_expected_updated_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.agenda_events%rowtype;v_profile uuid;
begin
 select profile_id into v_profile from public.pauta_agenda_appointments where event_id=p_event_id;
 if v_profile is null then raise exception 'Agendamento não encontrado';end if;
 if auth.uid() is null or (auth.uid()<>v_profile and not public.is_agenda_manager()) then
  raise exception 'Sem permissão para alterar compromisso de outro colaborador' using errcode='42501';end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 180 or
    length(coalesce(p_description,''))>4000 or length(coalesce(p_location,''))>240 or
    p_event_date is null or p_start_time is null or (p_end_time is not null and p_end_time<p_start_time) or
    (p_reminder_minutes is not null and p_reminder_minutes not in (0,5,10,15,30,60,120,1440)) then
  raise exception 'Confira título, data, horários e observações';end if;
 select * into v_event from public.agenda_events where id=p_event_id for update;
 if not found or v_event.status='cancelled' then raise exception 'Compromisso cancelado ou inexistente';end if;
 if v_event.updated_at is distinct from p_expected_updated_at then
  raise exception 'Compromisso modificado em outra sessão. Atualize antes de salvar';end if;
 update public.agenda_events set title=btrim(p_title),description=p_description,
  event_date=p_event_date,start_time=p_start_time,end_time=p_end_time,
  location=p_location,reminder_minutes=p_reminder_minutes,
  updated_by=auth.uid(),updated_at=now() where id=p_event_id;
 return true;
end;$$;
revoke all on function public.update_pauta_agenda_appointment(
 uuid,text,text,date,time without time zone,time without time zone,text,integer,timestamptz
) from public,anon;
grant execute on function public.update_pauta_agenda_appointment(
 uuid,text,text,date,time without time zone,time without time zone,text,integer,timestamptz
) to authenticated;

-- Exclusão apenas da Pauta; compromissos reais da Agenda são preservados.
-- O evento oculto de "Só matéria" pode ser cancelado sem afetar agenda real.
create or replace function public.archive_pauta_item_safely(
 p_pauta_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_pauta public.weekly_pauta_items%rowtype;v_event public.agenda_events%rowtype;
begin
 if not public.is_agenda_manager() then raise exception 'Sem permissão para excluir pauta' using errcode='42501';end if;
 select * into v_pauta from public.weekly_pauta_items where id=p_pauta_id for update;
 if not found then raise exception 'Pauta indisponível';end if;
 if v_pauta.status='cancelled' then return true;end if;
 select * into v_event from public.agenda_events where id=v_pauta.agenda_event_id for update;
 update public.weekly_pauta_items set status='cancelled',updated_at=now(),updated_by=auth.uid()
 where id=p_pauta_id;
 if v_event.id is not null and v_event.workflow_kind='article' and v_event.show_in_agenda=false then
  update public.agenda_events set status='cancelled',updated_at=now(),updated_by=auth.uid()
    where id=v_event.id;
 end if;
 return true;
end;$$;
revoke all on function public.archive_pauta_item_safely(uuid) from public,anon;
grant execute on function public.archive_pauta_item_safely(uuid) to authenticated;

-- Transferência de semana sem duplicar a pauta nem alterar uma sessão real
-- na Agenda. A data de entrega acompanha a semana (+7 dias).
create or replace function public.move_pauta_to_next_week(
 p_pauta_id uuid,p_expected_updated_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_pauta public.weekly_pauta_items%rowtype;v_event public.agenda_events%rowtype;
begin
 if not public.is_agenda_manager() then raise exception 'Sem permissão para transferir pauta' using errcode='42501';end if;
 select * into v_pauta from public.weekly_pauta_items where id=p_pauta_id for update;
 if not found or v_pauta.status<>'pending' then raise exception 'Somente pautas pendentes podem ser transferidas';end if;
 select * into v_event from public.agenda_events where id=v_pauta.agenda_event_id for update;
 if v_event.updated_at is distinct from p_expected_updated_at then
  raise exception 'Pauta alterada por outra pessoa. Atualize e tente novamente';end if;
 update public.weekly_pauta_items
 set week_start=v_pauta.week_start+7,
     due_date=case when due_date is null then null else due_date+7 end,
     updated_at=now(),updated_by=auth.uid()
 where id=p_pauta_id;
 if v_event.id is not null and v_event.workflow_kind='article' and v_event.show_in_agenda=false then
  update public.agenda_events set event_date=event_date+7,
   article_due_at=case when article_due_at is null then null else article_due_at+interval '7 days' end,
   updated_at=now(),updated_by=auth.uid() where id=v_event.id;
 end if;
 return true;
end;$$;
revoke all on function public.move_pauta_to_next_week(uuid,timestamptz) from public,anon;
grant execute on function public.move_pauta_to_next_week(uuid,timestamptz) to authenticated;

-- O cadastro editorial já é atômico. Ao ativar o agendamento, criar os
-- compromissos individuais na MESMA transação do cadastro, via p_crew.

CREATE OR REPLACE FUNCTION public.create_editorial_workflow(p_kind text, p_title text, p_description text, p_event_date date, p_start_time time without time zone, p_end_time time without time zone, p_location text, p_week_start date, p_city text, p_crew jsonb, p_writer uuid, p_due_date date, p_due_time time without time zone, p_repeat integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_index integer;v_occurrence date;v_event uuid;v_pauta uuid;v_week date;
 v_row record;v_task record;v_tasks jsonb;v_ids uuid[];v_id uuid;
 v_attends boolean;v_writer_present boolean;v_label text;v_kind text;
 v_seen text[];v_occ_due date;v_title text;v_workflow text;
 v_agenda_date date;v_agenda_time time without time zone;
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
      -- Agendamentos próprios por colaborador; o evento interno da matéria
      -- continua oculto na Agenda e o prazo editorial permanece separado.
      if p_kind='article' and nullif(p_crew->0->>'scheduleDate','') is not null then
        v_agenda_date:=(p_crew->0->>'scheduleDate')::date;
        v_agenda_time:=(p_crew->0->>'scheduleTime')::time;
        perform public.create_pauta_agenda_appointments(
          v_pauta,v_ids,v_agenda_date,v_agenda_time,30);
      end if;
   end if;
 end loop;
 return p_repeat;
end;$function$;
