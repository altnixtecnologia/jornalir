
-- Cobertura de equipe e fechamento: Agenda = presença individual;
-- Pauta = entregas (campo + matéria). Preserva coberturas legadas.
alter table public.event_coverages
  add column team_mode boolean not null default false;

create table public.event_coverage_members (
  event_id uuid not null references public.event_coverages(event_id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  field_task text,
  field_completed_at timestamptz,
  attendance_response text not null default 'pending'
    check (attendance_response in ('pending','present','not_required','unable')),
  attendance_responded_at timestamptz,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  primary key (event_id,profile_id),
  constraint field_task_length check (field_task is null or
    char_length(btrim(field_task)) between 2 and 80),
  constraint field_delivery_consistent check (field_task is not null or field_completed_at is null)
);
create index event_coverage_members_staff_idx
  on public.event_coverage_members(profile_id,attendance_response);
create trigger event_coverage_members_audit after insert or update or delete
  on public.event_coverage_members for each row execute function public.audit_agenda_change();
alter table public.event_coverage_members enable row level security;
revoke all on public.event_coverage_members from public,anon,authenticated;
grant select on public.event_coverage_members to authenticated;
grant all on public.event_coverage_members to service_role;
create policy coverage_members_staff_read on public.event_coverage_members
 for select to authenticated using (
  (select public.is_active_staff()) and
  ((select public.has_staff_module_access('agenda',false))
   or (select public.has_staff_module_access('pauta',false)))
 );

create table public.event_coverage_member_transfers (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.event_coverages(event_id) on delete cascade,
 from_profile_id uuid not null references public.profiles(id),
 to_profile_id uuid not null references public.profiles(id),
 transfer_part text not null check(transfer_part in ('field','article','both')),
 reason text not null check(char_length(btrim(reason)) between 5 and 300),
 status text not null default 'pending' check(status in ('pending','accepted','declined','forced')),
 requested_by uuid not null references public.profiles(id),
 requested_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id),
 decided_at timestamptz
);
create unique index event_coverage_member_transfer_pending_idx
 on public.event_coverage_member_transfers(event_id,from_profile_id,transfer_part) where status='pending';
create index event_coverage_member_transfers_to_idx on public.event_coverage_member_transfers(to_profile_id,status);
create trigger event_coverage_member_transfers_audit after insert or update or delete
 on public.event_coverage_member_transfers for each row execute function public.audit_agenda_change();
alter table public.event_coverage_member_transfers enable row level security;
revoke all on public.event_coverage_member_transfers from public,anon,authenticated;
grant select on public.event_coverage_member_transfers to authenticated;
grant all on public.event_coverage_member_transfers to service_role;
create policy coverage_transfers_staff_read on public.event_coverage_member_transfers
 for select to authenticated using (
  (select public.is_active_staff()) and
  ((select public.has_staff_module_access('agenda',false))
   or (select public.has_staff_module_access('pauta',false)))
 );

-- Somente funções verificadas modificam titulares e entregas.
-- Para o sistema antigo, team_mode=false deixa intactas as regras existentes.
create or replace function public.notify_coverage_assignment(
 p_event_id uuid,p_profile_id uuid,p_suffix text default 'initial'
) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 insert into public.notification_events(app_kind,kind,target_profile_id,title,body,href,dedupe_key)
 select 'sistema','agenda',p_profile_id,'Escalado para cobertura',
        e.title||' · Você foi incluído na equipe. Confira sua participação e sua tarefa.',
        (case when e.show_in_agenda then '/sistema/agenda?date='
              else '/sistema/pauta?date=' end)||e.event_date::text,
        'coverage:assigned:'||p_event_id::text||':'||p_profile_id::text||':'||p_suffix
 from public.agenda_events e where e.id=p_event_id
 on conflict(dedupe_key) do nothing;
end;$$;
revoke all on function public.notify_coverage_assignment(uuid,uuid,text) from public,anon,authenticated;

-- Recalcula as duas situações sem misturá-las: resposta da presença
-- encerra participação na Agenda; entregas pendentes continuam na Pauta.
create or replace function public.reconcile_coverage_team(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype; v_all_attendance boolean;v_all_fields boolean;
begin
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found or not v_c.team_mode then return;end if;
 select count(*)>0 and bool_and(attendance_response<>'pending')
 into v_all_attendance from public.event_coverage_members where event_id=p_event_id;
 select coalesce(bool_and(field_completed_at is not null),true)
 into v_all_fields from public.event_coverage_members
 where event_id=p_event_id and field_task is not null;
 -- NÃO modificar o status de itens da Pauta a partir do status da Agenda.
 update public.agenda_events set
   status=case when v_all_attendance then 'completed' else 'scheduled' end,
   completed_at=case when v_all_attendance then coalesce(completed_at,now()) else null end,
   updated_by=auth.uid(),updated_at=now()
 where id=p_event_id and status<>'cancelled'
   and status is distinct from (case when v_all_attendance then 'completed' else 'scheduled' end);
 update public.weekly_pauta_items set
   status=case when v_all_fields and v_c.article_status='completed' then 'completed' else 'pending' end,
   completed_at=case when v_all_fields and v_c.article_status='completed'
     then coalesce(completed_at,now()) else null end,
   completed_by=case when v_all_fields and v_c.article_status='completed'
     then coalesce(completed_by,auth.uid()) else null end,
   updated_by=auth.uid(),updated_at=now()
 where agenda_event_id=p_event_id and status<>'cancelled'
   and status is distinct from (case when v_all_fields and v_c.article_status='completed'
     then 'completed' else 'pending' end);
end;$$;
revoke all on function public.reconcile_coverage_team(uuid) from public,anon,authenticated;

-- O sync de edição preserva o resultado editorial da cobertura.
create or replace function public.sync_pauta_snapshot_from_agenda()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_kind <> 'editorial' then return new;end if;
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

-- O botão antigo da Agenda não pode forçar conclusão sem respostas.
create or replace function public.guard_coverage_before_agenda_complete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' then
  if exists(select 1 from public.event_coverages c where c.event_id=new.id and
     c.team_mode) and exists(select 1 from public.event_coverage_members m
     where m.event_id=new.id and m.attendance_response='pending') then
   raise exception 'Há participantes sem resposta na Agenda.';
  end if;
  if exists(select 1 from public.event_coverages c where c.event_id=new.id and
     not c.team_mode and (c.article_status<>'completed' or c.task_status<>'completed')) then
   raise exception 'Cobertura com entrega pendente.';
  end if;
 end if;
 return new;
end;$$;

-- Criar equipe dinâmica (1 a 16 pessoas de campo) a partir de evento existente.
-- Primeiro cria a cobertura legada para reaproveitar permissões/integração.
create or replace function public.create_coverage_team(
 p_event_id uuid,p_staff jsonb,p_article_owner uuid,p_audible integer default 60,
 p_checkin integer default 5
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_first uuid;v_first_task text;v_row record;v_count int;
begin
 if auth.uid() is null or not public.is_agenda_manager() then
  raise exception 'Sem permissão para designar a equipe' using errcode='42501';end if;
 if p_staff is null or jsonb_typeof(p_staff)<>'array' or
    jsonb_array_length(p_staff) not between 1 and 16 then
  raise exception 'Escolha entre 1 e 16 colaboradores de campo';end if;
 if not exists(select 1 from public.profiles p where p.id=p_article_owner and p.active)
  then raise exception 'Redator inválido';end if;
 select count(*) into v_count from (
  select distinct (x->>'profileId')::uuid as id from jsonb_array_elements(p_staff) x
 ) q;
 if v_count<>jsonb_array_length(p_staff) then raise exception 'Colaborador repetido';end if;
 for v_row in select x->>'profileId' as id,x->>'task' as task
   from jsonb_array_elements(p_staff) x loop
  if v_row.id is null or not exists(select 1 from public.profiles p
    where p.id=v_row.id::uuid and p.active) or
    length(btrim(coalesce(v_row.task,''))) not between 2 and 80 then
    raise exception 'Colaborador ou tarefa inválida';end if;
 end loop;
 select (x->>'profileId')::uuid,btrim(x->>'task') into v_first,v_first_task
  from jsonb_array_elements(p_staff) x limit 1;
 perform public.create_coverage_for_event_with_task(
   p_event_id,v_first,p_article_owner,p_audible,p_checkin,v_first_task);
 update public.event_coverages set team_mode=true where event_id=p_event_id;
 for v_row in select (x->>'profileId')::uuid as id,btrim(x->>'task') as task
    from jsonb_array_elements(p_staff) x loop
   insert into public.event_coverage_members(event_id,profile_id,field_task,assigned_by)
   values(p_event_id,v_row.id,v_row.task,auth.uid());
   perform public.notify_coverage_assignment(p_event_id,v_row.id,'initial');
 end loop;
 if not exists(select 1 from public.event_coverage_members
     where event_id=p_event_id and profile_id=p_article_owner) then
   insert into public.event_coverage_members(event_id,profile_id,assigned_by)
   values(p_event_id,p_article_owner,auth.uid());
   perform public.notify_coverage_assignment(p_event_id,p_article_owner,'article');
 end if;
 return p_event_id;
end;$$;
revoke all on function public.create_coverage_team(uuid,jsonb,uuid,integer,integer) from public,anon;
grant execute on function public.create_coverage_team(uuid,jsonb,uuid,integer,integer) to authenticated;

-- Nova atribuição após a cobertura já ter sido criada.
create or replace function public.add_coverage_team_member(
 p_event_id uuid,p_profile_id uuid,p_field_task text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype;v_task text:=btrim(coalesce(p_field_task,''));
begin
 if auth.uid() is null or not public.is_agenda_manager() then
  raise exception 'Sem permissão' using errcode='42501';end if;
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found or not v_c.team_mode then raise exception 'Equipe indisponível';end if;
 if char_length(v_task) not between 2 and 80 or
   not exists(select 1 from public.profiles p where p.id=p_profile_id and p.active)
   then raise exception 'Colaborador ou função inválidos';end if;
 insert into public.event_coverage_members(event_id,profile_id,field_task,assigned_by)
 values(p_event_id,p_profile_id,v_task,auth.uid())
 on conflict(event_id,profile_id) do update set
   field_task=excluded.field_task,field_completed_at=null,
   revision=event_coverage_members.revision+1,updated_at=now();
 insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
 values(p_event_id,p_profile_id,'responsible') on conflict(event_id,profile_id) do nothing;
 perform public.notify_coverage_assignment(p_event_id,p_profile_id,'added:'||now()::text);
 perform public.reconcile_coverage_team(p_event_id);
 return true;
end;$$;
revoke all on function public.add_coverage_team_member(uuid,uuid,text) from public,anon;
grant execute on function public.add_coverage_team_member(uuid,uuid,text) to authenticated;

-- Um clique grava a resposta; clicar noutro botão corrige o registro.
create or replace function public.set_coverage_member_attendance(
 p_event_id uuid,p_answer text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 if p_answer not in ('present','not_required','unable') then
  raise exception 'Resposta inválida';end if;
 update public.event_coverage_members set attendance_response=p_answer,
   attendance_responded_at=now(),updated_at=now(),revision=revision+1
 where event_id=p_event_id and profile_id=auth.uid();
 if not found then raise exception 'Você não está escalado neste evento' using errcode='42501';end if;
 perform public.reconcile_coverage_team(p_event_id);
 return true;
end;$$;
revoke all on function public.set_coverage_member_attendance(uuid,text) from public,anon;
grant execute on function public.set_coverage_member_attendance(uuid,text) to authenticated;

create or replace function public.set_coverage_member_task(
 p_event_id uuid,p_completed boolean
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 update public.event_coverage_members set
   field_completed_at=case when p_completed then now() else null end,
   updated_at=now()
 where event_id=p_event_id and profile_id=auth.uid() and field_task is not null;
 if not found then raise exception 'Você não possui entrega de campo neste evento' using errcode='42501';end if;
 perform public.reconcile_coverage_team(p_event_id);
 return true;
end;$$;
revoke all on function public.set_coverage_member_task(uuid,boolean) from public,anon;
grant execute on function public.set_coverage_member_task(uuid,boolean) to authenticated;

-- Redação da matéria permanece com um titular (pode ser alguém da equipe de campo).
create or replace function public.set_event_coverage_article(p_event_id uuid,p_completed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.event_coverages%rowtype;e public.agenda_events%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 select * into c from public.event_coverages where event_id=p_event_id for update;
 if not found then raise exception 'Cobertura não encontrada';end if;
 if auth.uid()<>c.article_owner_id and not public.is_agenda_manager() then
  raise exception 'Somente redator ou gestor pode concluir a matéria' using errcode='42501';end if;
 select * into e from public.agenda_events where id=p_event_id for update;
 if e.status='cancelled' then raise exception 'Evento cancelado';end if;
 update public.event_coverages set article_status=case when p_completed then 'completed' else 'pending' end,
  article_completed_at=case when p_completed then coalesce(article_completed_at,now()) else null end,
  updated_by=auth.uid(),updated_at=now()
 where event_id=p_event_id;
 if c.team_mode then
  perform public.reconcile_coverage_team(p_event_id);
 else
  update public.agenda_events set status=case when p_completed and c.task_status='completed'
    then 'completed' else 'scheduled' end,
    completed_at=case when p_completed and c.task_status='completed'
      then coalesce(completed_at,now()) else null end,
    updated_by=auth.uid(),updated_at=now() where id=p_event_id;
 end if;
 return true;
end;$$;

-- Transferências com aceite; titular anterior permanece até confirmação.
create or replace function public.request_coverage_member_transfer(
 p_event_id uuid,p_from uuid,p_to uuid,p_part text,p_reason text,p_force boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype;v_id uuid;v_me uuid:=auth.uid();
begin
 if v_me is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found or not v_c.team_mode then raise exception 'Cobertura indisponível';end if;
 if p_part not in('field','article','both') or
  length(btrim(coalesce(p_reason,''))) not between 5 and 300 or
  not exists(select 1 from public.profiles p where p.id=p_to and p.active) or p_to=p_from then
  raise exception 'Destinatário ou motivo inválido';end if;
 if p_force and not public.is_agenda_manager() then raise exception 'Só gestor pode efetivar diretamente' using errcode='42501';end if;
 if not public.is_agenda_manager() and p_from<>v_me then raise exception 'Só o titular pode transferir' using errcode='42501';end if;
 if not public.is_agenda_manager() and (
   (p_part in('field','both') and not exists(select 1 from public.event_coverage_members
     where event_id=p_event_id and profile_id=p_from and field_task is not null))
   or (p_part in('article','both') and v_c.article_owner_id<>p_from)
 ) then raise exception 'Você não é titular desta responsabilidade' using errcode='42501';end if;
 insert into public.event_coverage_member_transfers(
  event_id,from_profile_id,to_profile_id,transfer_part,reason,status,requested_by,decided_by,decided_at
 ) values(p_event_id,p_from,p_to,p_part,btrim(p_reason),
   case when p_force then 'forced' else 'pending' end,
   v_me,case when p_force then v_me else null end,
   case when p_force then now() else null end)
 returning id into v_id;
 if p_force then
  perform public.apply_coverage_member_transfer(v_id);
 else
  insert into public.notification_events(app_kind,kind,target_profile_id,title,body,href,dedupe_key)
  select 'sistema','agenda',p_to,'Confirme transferência da cobertura',
    e.title||' · Aceite ou recuse a responsabilidade.',
    (case when e.show_in_agenda then '/sistema/agenda?date='
      else '/sistema/pauta?date=' end)||e.event_date::text,
    'coverage:member-transfer:'||v_id::text
  from public.agenda_events e where e.id=p_event_id
  on conflict(dedupe_key) do nothing;
 end if;
 return v_id;
end;$$;

create or replace function public.apply_coverage_member_transfer(p_transfer uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare t public.event_coverage_member_transfers%rowtype;
 c public.event_coverages%rowtype;v_task text;v_done timestamptz;
begin
 select * into t from public.event_coverage_member_transfers where id=p_transfer for update;
 if not found or t.status not in('accepted','forced') then
  raise exception 'Transferência não efetivada';end if;
 select * into c from public.event_coverages where event_id=t.event_id for update;
 if not found or not c.team_mode then raise exception 'Cobertura não encontrada';end if;
 if not exists(select 1 from public.profiles p where p.id=t.to_profile_id and p.active) then
  raise exception 'Destinatário inativo';end if;
 if t.transfer_part in('field','both') then
  select field_task,field_completed_at into v_task,v_done from public.event_coverage_members
   where event_id=t.event_id and profile_id=t.from_profile_id for update;
  if v_task is null then raise exception 'Tarefa de campo já transferida';end if;
  insert into public.event_coverage_members(event_id,profile_id,field_task,field_completed_at,assigned_by)
  values(t.event_id,t.to_profile_id,v_task,v_done,auth.uid())
  on conflict(event_id,profile_id) do update set
   field_task=excluded.field_task,field_completed_at=excluded.field_completed_at,
   revision=event_coverage_members.revision+1,updated_at=now();
  update public.event_coverage_members set field_task=null,field_completed_at=null,
    attendance_response=case when attendance_response='pending' then 'unable' else attendance_response end,
    attendance_responded_at=case when attendance_response='pending' then now() else attendance_responded_at end,
    updated_at=now()
   where event_id=t.event_id and profile_id=t.from_profile_id;
  if c.attendance_owner_id=t.from_profile_id then
   update public.event_coverages set attendance_owner_id=t.to_profile_id,revision=revision+1
     where event_id=t.event_id;
  end if;
 end if;
 if t.transfer_part in('article','both') then
  if c.article_owner_id<>t.from_profile_id then raise exception 'Matéria já transferida';end if;
  insert into public.event_coverage_members(event_id,profile_id,assigned_by)
  values(t.event_id,t.to_profile_id,auth.uid()) on conflict(event_id,profile_id) do nothing;
  update public.event_coverages set article_owner_id=t.to_profile_id,updated_by=auth.uid()
   where event_id=t.event_id;
  update public.event_coverage_members set
   attendance_response='not_required',attendance_responded_at=now(),updated_at=now()
   where event_id=t.event_id and profile_id=t.from_profile_id and field_task is null
    and attendance_response='pending';
 end if;
 insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
 values(t.event_id,t.to_profile_id,'responsible') on conflict(event_id,profile_id) do nothing;
 perform public.notify_coverage_assignment(t.event_id,t.to_profile_id,'transfer:'||t.id::text);
 perform public.reconcile_coverage_team(t.event_id);
 return true;
end;$$;
revoke all on function public.apply_coverage_member_transfer(uuid) from public,anon,authenticated;

create or replace function public.respond_coverage_member_transfer(
 p_transfer uuid,p_accept boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.event_coverage_member_transfers%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 select * into t from public.event_coverage_member_transfers where id=p_transfer for update;
 if not found or t.status<>'pending' or t.to_profile_id<>auth.uid() then
  raise exception 'Só o destinatário pode responder' using errcode='42501';end if;
 update public.event_coverage_member_transfers set status=case when p_accept then 'accepted' else 'declined' end,
 decided_by=auth.uid(),decided_at=now() where id=p_transfer;
 if p_accept then perform public.apply_coverage_member_transfer(p_transfer);end if;
 return true;
end;$$;
revoke all on function public.request_coverage_member_transfer(uuid,uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.request_coverage_member_transfer(uuid,uuid,uuid,text,text,boolean) to authenticated;
revoke all on function public.respond_coverage_member_transfer(uuid,boolean) from public,anon;
grant execute on function public.respond_coverage_member_transfer(uuid,boolean) to authenticated;


-- Criar compromisso + equipe numa única chamada para não deixar "meio evento".
create or replace function public.create_coverage_team_agenda(
 p_title text,p_description text,p_event_date date,p_start_time time,
 p_end_time time,p_location text,p_staff jsonb,p_article_owner uuid,
 p_audible integer default 60,p_checkin integer default 5
) returns uuid language plpgsql security definer set search_path='' as $
declare v_id uuid;
begin
 if auth.uid() is null or not public.is_agenda_manager() then
  raise exception 'Sem permissão' using errcode='42501';end if;
 if char_length(btrim(coalesce(p_title,''))) not between 1 and 180
  or p_event_date is null or p_start_time is null
  or (p_end_time is not null and p_end_time<p_start_time)
  or char_length(coalesce(p_description,''))>4000
  or char_length(coalesce(p_location,''))>240 then
   raise exception 'Dados do compromisso inválidos';end if;
 insert into public.agenda_events(
  title,description,event_date,start_time,end_time,location,event_kind,reminder_minutes,show_in_agenda
 ) values(btrim(p_title),p_description,p_event_date,p_start_time,p_end_time,p_location,'general',null,true)
 returning id into v_id;
 perform public.create_coverage_team(v_id,p_staff,p_article_owner,p_audible,p_checkin);
 return v_id;
end;$;
revoke all on function public.create_coverage_team_agenda(text,text,date,time,time,text,jsonb,uuid,integer,integer) from public,anon;
grant execute on function public.create_coverage_team_agenda(text,text,date,time,time,text,jsonb,uuid,integer,integer) to authenticated;

create or replace function public.create_coverage_team_pauta(
 p_title text,p_description text,p_event_date date,p_start_time time,
 p_week_start date,p_show_in_agenda boolean,p_staff jsonb,p_article_owner uuid,
 p_audible integer default 60,p_checkin integer default 5
) returns uuid language plpgsql security definer set search_path='' as $
declare v_pauta uuid;v_event uuid;v_profile_ids uuid[];
begin
 if auth.uid() is null or not public.is_agenda_manager() then
  raise exception 'Sem permissão' using errcode='42501';end if;
 if p_start_time is null then raise exception 'Informe o horário da cobertura';end if;
 if p_staff is null or jsonb_typeof(p_staff)<>'array' or jsonb_array_length(p_staff)<1 then
  raise exception 'Adicione pelo menos um colaborador';end if;
 select array_agg(distinct id) into v_profile_ids from (
  select (x->>'profileId')::uuid as id from jsonb_array_elements(p_staff) x
  union all select p_article_owner
 ) persons;
 v_pauta := public.create_editorial_pauta_in_period(
  p_title,p_description,p_event_date,p_start_time,v_profile_ids,p_week_start,p_show_in_agenda
 );
 select agenda_event_id into v_event from public.weekly_pauta_items where id=v_pauta;
 if v_event is null then raise exception 'Vínculo com agenda não criado';end if;
 perform public.create_coverage_team(v_event,p_staff,p_article_owner,p_audible,p_checkin);
 return v_pauta;
end;$;
revoke all on function public.create_coverage_team_pauta(text,text,date,time,date,boolean,jsonb,uuid,integer,integer) from public,anon;
grant execute on function public.create_coverage_team_pauta(text,text,date,time,date,boolean,jsonb,uuid,integer,integer) to authenticated;

-- Comunicação de mudanças a painel e app da Pauta.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' and tablename='event_coverage_members') then
  alter publication supabase_realtime add table public.event_coverage_members;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' and tablename='event_coverage_member_transfers') then
  alter publication supabase_realtime add table public.event_coverage_member_transfers;
 end if;
end $$;
