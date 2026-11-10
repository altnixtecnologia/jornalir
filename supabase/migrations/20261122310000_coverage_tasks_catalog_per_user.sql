
-- Entregas individuais da equipe: uma pessoa pode fazer fotos + vídeo etc.,
-- sem duplicar seu cadastro na equipe. Não remove dados de cobertura legada.
create table public.event_coverage_member_tasks (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null,
 profile_id uuid not null,
 task_kind text not null check(task_kind in
   ('photos','video','interviews','audio','research','live','media','custom')),
 task_label text not null check(char_length(btrim(task_label)) between 2 and 80),
 completed_at timestamptz,
 completed_by uuid references public.profiles(id),
 assigned_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (event_id,profile_id)
   references public.event_coverage_members(event_id,profile_id)
   on update cascade on delete cascade
);
create unique index event_coverage_member_tasks_unique_idx
 on public.event_coverage_member_tasks(event_id,profile_id,lower(task_label));
create index event_coverage_member_tasks_event_idx
 on public.event_coverage_member_tasks(event_id,completed_at);
create trigger event_coverage_member_tasks_audit
 after insert or update or delete on public.event_coverage_member_tasks
 for each row execute function public.audit_agenda_change();
alter table public.event_coverage_member_tasks enable row level security;
revoke all on public.event_coverage_member_tasks from public,anon,authenticated;
grant select on public.event_coverage_member_tasks to authenticated;
grant all on public.event_coverage_member_tasks to service_role;
create policy coverage_tasks_staff_read on public.event_coverage_member_tasks
 for select to authenticated using (
  (select public.is_active_staff()) and
  ((select public.has_staff_module_access('agenda',false))
   or (select public.has_staff_module_access('pauta',false)))
 );

-- Coberturas existentes continuam utilizáveis, sem apagar conclusão.
insert into public.event_coverage_member_tasks(
 event_id,profile_id,task_kind,task_label,completed_at,completed_by,assigned_by)
select event_id,profile_id,'custom',field_task,field_completed_at,
 case when field_completed_at is not null then profile_id else null end,assigned_by
from public.event_coverage_members where field_task is not null;

-- O redator que não fará cobertura presencial não deve ficar com presença pendente.
update public.event_coverage_members m
set attendance_response='not_required',attendance_responded_at=now(),updated_at=now()
from public.event_coverages c
where c.event_id=m.event_id and c.team_mode and m.profile_id=c.article_owner_id
 and m.field_task is null and m.attendance_response='pending';


create or replace function public.reconcile_coverage_team(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype; v_all_attendance boolean;v_all_fields boolean;
begin
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found or not v_c.team_mode then return;end if;
 select count(*)>0 and bool_and(attendance_response<>'pending')
 into v_all_attendance from public.event_coverage_members where event_id=p_event_id;
 select coalesce(bool_and(completed_at is not null),true)
 into v_all_fields from public.event_coverage_member_tasks
 where event_id=p_event_id;
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
      when 'media' then 'Seleção e envio de mídias'
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

-- Adiciona novas tarefas a uma pessoa já escalada ou inclui novo colaborador.
-- Nunca substitui uma tarefa entregue nem apaga outra responsabilidade.
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
      when 'media' then 'Seleção e envio de mídias'
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
revoke all on function public.assign_coverage_member_tasks(uuid,uuid,jsonb) from public,anon;
grant execute on function public.assign_coverage_member_tasks(uuid,uuid,jsonb) to authenticated;

-- Somente o responsável escalado, ou gestor com permissão, conclui/reabre
-- uma entrega específica. O responsável pela matéria é controlado à parte.
create or replace function public.set_coverage_member_task_status(
 p_task_id uuid,p_completed boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_task public.event_coverage_member_tasks%rowtype;v_all_done boolean;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 select * into v_task from public.event_coverage_member_tasks
  where id=p_task_id for update;
 if not found then raise exception 'Tarefa inexistente';end if;
 if auth.uid()<>v_task.profile_id and not public.is_agenda_manager() then
  raise exception 'Somente o responsável pode dar baixa nesta entrega'
  using errcode='42501';end if;
 if (v_task.completed_at is not null)=p_completed then return true;end if;
 update public.event_coverage_member_tasks set
   completed_at=case when p_completed then now() else null end,
   completed_by=case when p_completed then auth.uid() else null end,
   updated_at=now() where id=p_task_id;
 select coalesce(bool_and(completed_at is not null),false)
  into v_all_done from public.event_coverage_member_tasks
  where event_id=v_task.event_id and profile_id=v_task.profile_id;
 update public.event_coverage_members
  set field_completed_at=case when v_all_done then now() else null end,
  updated_at=now()
  where event_id=v_task.event_id and profile_id=v_task.profile_id;
 perform public.reconcile_coverage_team(v_task.event_id);
 return true;
end;$$;
revoke all on function public.set_coverage_member_task_status(uuid,boolean) from public,anon;
grant execute on function public.set_coverage_member_task_status(uuid,boolean) to authenticated;

-- Compatibilidade com o botão antigo: conclui todas as tarefas da própria
-- pessoa, porém a interface nova marca cada uma separadamente.
create or replace function public.set_coverage_member_task(
 p_event_id uuid,p_completed boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_any boolean;v_all boolean;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 update public.event_coverage_member_tasks set
  completed_at=case when p_completed then now() else null end,
  completed_by=case when p_completed then auth.uid() else null end,updated_at=now()
 where event_id=p_event_id and profile_id=auth.uid();
 v_any:=found;
 if not v_any then raise exception 'Você não possui tarefa de campo neste evento';end if;
 update public.event_coverage_members set
  field_completed_at=case when p_completed then now() else null end,updated_at=now()
 where event_id=p_event_id and profile_id=auth.uid();
 perform public.reconcile_coverage_team(p_event_id);
 return true;
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
  update public.event_coverage_member_tasks
    set profile_id=t.to_profile_id,updated_at=now()
    where event_id=t.event_id and profile_id=t.from_profile_id;
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

create or replace function public.tv_pauta_snapshot(p_token_hash text,p_focus_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_device uuid;v_week date;v_period_start date;v_period_end date;
 v_cards jsonb:='[]'::jsonb;v_total int:=0;v_completed int:=0;v_pending int:=0;
 r record;v_status text;v_field_done boolean;v_any_field_done boolean;
 v_detail text;v_member_detail text;v_writer text;v_field_owner text;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return null;end if;
 select id into v_device from public.tv_pauta_devices
  where token_hash=p_token_hash and revoked_at is null;
 if v_device is null then return null;end if;
 update public.tv_pauta_devices set last_seen_at=now()
  where id=v_device and (last_seen_at is null or last_seen_at<now()-interval '2 minutes');
 v_week:=public.pauta_week_start(coalesce(p_focus_date,(now() at time zone 'America/Sao_Paulo')::date));
 select coalesce(o.period_start,v_week),coalesce(o.period_end,v_week+6)
  into v_period_start,v_period_end from (select 1) q
   left join public.pauta_week_overrides o on o.week_start=v_week;
 for r in
   select q.id,q.title,q.due_date,q.status as pauta_status,
          coalesce(pr.name,'Equipe') as responsible_name,
          c.event_id as coverage_id,c.team_mode,c.article_status,c.task_status,c.task_label,
          coalesce(ap.name,'Redação') as article_name,
          coalesce(fp.name,'Cobertura') as field_name
   from public.weekly_pauta_items q
   left join public.profiles pr on pr.id=q.responsible_profile_id
   left join public.event_coverages c on c.event_id=q.agenda_event_id
   left join public.profiles ap on ap.id=c.article_owner_id
   left join public.profiles fp on fp.id=c.attendance_owner_id
   where q.week_start=v_week
   order by q.sort_order,q.created_at
 loop
   v_status:='pending';
   v_detail:='Aguardando responsável';
   v_writer:=coalesce(r.article_name,r.responsible_name);
   if r.pauta_status='cancelled' then
     v_status:='cancelled';v_detail:='Cancelada';
   elsif r.coverage_id is not null then
     if r.team_mode then
       select coalesce(bool_and(m.completed_at is not null),true),
         coalesce(bool_or(m.completed_at is not null),false),
         coalesce(string_agg(m.task_label||': '||coalesce(p.name,'Colaborador'),' · '
            order by m.created_at) filter (where m.completed_at is null),'')
         into v_field_done,v_any_field_done,v_member_detail
         from public.event_coverage_member_tasks m
         left join public.profiles p on p.id=m.profile_id
         where m.event_id=r.coverage_id;
     else
       v_field_done:=r.task_status='completed';
       v_any_field_done:=v_field_done;
       v_member_detail:=case when not v_field_done then
         r.task_label||': '||r.field_name else '' end;
     end if;
     v_detail:=concat_ws(' · ',
       case when r.article_status<>'completed' then 'Matéria: '||r.article_name end,
       nullif(v_member_detail,''));
     if v_detail='' then v_detail:='Entregas concluídas';end if;
     if r.article_status='completed' and v_field_done then
       v_status:='completed';
     elsif r.article_status='completed' or v_any_field_done then
       v_status:='in_progress';
     end if;
   else
     v_status:=case when r.pauta_status='completed' then 'completed' else 'pending' end;
     v_detail:=case when v_status='completed' then 'Concluída' else 'Responsável: '||r.responsible_name end;
   end if;
   if v_status<>'cancelled' then
     v_total:=v_total+1;
     if v_status='completed' then v_completed:=v_completed+1;
     else v_pending:=v_pending+1;end if;
   end if;
   v_cards:=v_cards||jsonb_build_array(jsonb_build_object(
     'id',r.id,'title',r.title,'responsible',case when r.coverage_id is null
       then r.responsible_name else v_writer end,
     'detail',v_detail,'date',r.due_date,'status',v_status));
 end loop;
 return jsonb_build_object('weekStart',v_week,'periodStart',v_period_start,
  'periodEnd',v_period_end,'cards',v_cards,'total',v_total,
  'completed',v_completed,'pending',v_pending,'generatedAt',now());
end;$$;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' and tablename='event_coverage_member_tasks') then
    alter publication supabase_realtime add table public.event_coverage_member_tasks;
 end if;
end $$;
