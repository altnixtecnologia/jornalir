
-- Cobertura jornalística: presença e matéria independentes, transferência com aceite.
-- Não muda compromissos nem pautas existentes. Sem entregas externas por DDL.
create table public.event_coverages (
  event_id uuid primary key references public.agenda_events(id) on delete cascade,
  attendance_owner_id uuid not null references public.profiles(id),
  article_owner_id uuid not null references public.profiles(id),
  attendance_status text not null default 'pending' check (attendance_status in ('pending','on_way','present','absent')),
  attendance_at timestamptz,
  article_status text not null default 'pending' check (article_status in ('pending','completed')),
  article_completed_at timestamptz,
  article_due_at timestamptz,
  audible_minutes integer not null default 60 check (audible_minutes between -1440 and 1440),
  checkin_minutes integer not null default 5 check (checkin_minutes between -120 and 120),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_coverages_attendance_idx on public.event_coverages(attendance_owner_id);
create index event_coverages_article_idx on public.event_coverages(article_owner_id);
create trigger event_coverages_audit after insert or update or delete on public.event_coverages
  for each row execute function public.audit_agenda_change();
alter table public.event_coverages enable row level security;
revoke all on public.event_coverages from public, anon, authenticated;
grant select on public.event_coverages to authenticated;
grant all on public.event_coverages to service_role;
create policy event_coverages_staff_read on public.event_coverages for select to authenticated
  using ((select public.is_active_staff()) and (
    (select public.has_staff_module_access('agenda',false)) or
    (select public.has_staff_module_access('pauta',false))
  ));

create table public.event_coverage_transfers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_coverages(event_id) on delete cascade,
  transfer_part text not null check (transfer_part in ('attendance','article','both')),
  from_attendance_id uuid not null references public.profiles(id),
  from_article_id uuid not null references public.profiles(id),
  to_profile_id uuid not null references public.profiles(id),
  requested_by uuid not null references public.profiles(id),
  decided_by uuid references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 5 and 300),
  status text not null default 'pending' check (status in ('pending','accepted','declined','forced','cancelled')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index event_coverage_one_pending_transfer on public.event_coverage_transfers(event_id)
  where status='pending';
create index event_coverage_transfer_to_idx on public.event_coverage_transfers(to_profile_id,status);
create trigger event_coverage_transfers_audit after insert or update or delete on public.event_coverage_transfers
  for each row execute function public.audit_agenda_change();
alter table public.event_coverage_transfers enable row level security;
revoke all on public.event_coverage_transfers from public, anon, authenticated;
grant select on public.event_coverage_transfers to authenticated;
grant all on public.event_coverage_transfers to service_role;
create policy event_coverage_transfers_staff_read on public.event_coverage_transfers for select to authenticated
  using ((select public.is_active_staff()) and (
    (select public.has_staff_module_access('agenda',false)) or
    (select public.has_staff_module_access('pauta',false))
  ));

-- Todas as alterações se dão por RPCs atômicas, com verificação de sessão/atribuição.
-- Nenhuma tabela de cobertura tem GRANT INSERT/UPDATE/DELETE a authenticated.
create or replace function public.create_coverage_for_event(
 p_event_id uuid,p_attendance_owner uuid,p_article_owner uuid,p_audible_minutes int default 60,
 p_checkin_minutes int default 5,p_article_due_at timestamptz default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_ev public.agenda_events%rowtype;
begin
 if auth.uid() is null or not public.is_agenda_manager() then
   raise exception 'Sem permissão para organizar cobertura' using errcode='42501';
 end if;
 if p_event_id is null or p_attendance_owner is null or p_article_owner is null then
   raise exception 'Informe evento e responsáveis';
 end if;
 if p_audible_minutes not between -1440 and 1440 or p_checkin_minutes not between -120 and 120 then
   raise exception 'Intervalo de lembrete inválido';
 end if;
 if exists (select 1 from public.profiles p where p.id in (p_attendance_owner,p_article_owner)
              and p.active and public.is_active_staff()) = false
   or (select count(distinct p.id) from public.profiles p
       where p.id in (p_attendance_owner,p_article_owner) and p.active) <>
     (select count(distinct x) from unnest(array[p_attendance_owner,p_article_owner]) x) then
   raise exception 'Responsável inválido ou inativo';
 end if;
 select * into v_ev from public.agenda_events where id=p_event_id for update;
 if not found or v_ev.status <> 'scheduled' or v_ev.start_time is null then
   raise exception 'A cobertura exige compromisso agendado com horário';
 end if;
 if exists(select 1 from public.event_coverages where event_id=p_event_id) then
   raise exception 'Este compromisso já possui cobertura';
 end if;
 if not exists(select 1 from public.weekly_pauta_items where agenda_event_id=p_event_id) then
   perform public.add_agenda_event_to_pauta(p_event_id);
 end if;
 update public.agenda_events
   set reminder_minutes=null,updated_by=auth.uid(),updated_at=now()
   where id=p_event_id;
 insert into public.event_coverages
  (event_id,attendance_owner_id,article_owner_id,article_due_at,audible_minutes,checkin_minutes,created_by,updated_by)
 values(p_event_id,p_attendance_owner,p_article_owner,p_article_due_at,p_audible_minutes,p_checkin_minutes,auth.uid(),auth.uid());
 insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
   select p_event_id,x,'responsible' from
     (select distinct unnest(array[p_attendance_owner,p_article_owner]) x) s
   on conflict(event_id,profile_id) do nothing;
 update public.weekly_pauta_items set responsible_profile_id=p_attendance_owner
   where agenda_event_id=p_event_id;
 return p_event_id;
end;$$;
revoke all on function public.create_coverage_for_event(uuid,uuid,uuid,int,int,timestamptz) from public,anon;
grant execute on function public.create_coverage_for_event(uuid,uuid,uuid,int,int,timestamptz) to authenticated;

create or replace function public.create_coverage_agenda(
 p_title text,p_description text,p_event_date date,p_start_time time,p_end_time time,
 p_location text,p_attendance_owner uuid,p_article_owner uuid,
 p_audible_minutes int default 60,p_checkin_minutes int default 5
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.is_agenda_manager() then
   raise exception 'Sem permissão' using errcode='42501';
 end if;
 if char_length(btrim(coalesce(p_title,''))) not between 1 and 180
    or p_event_date is null or p_start_time is null
    or (p_end_time is not null and p_end_time < p_start_time)
    or char_length(coalesce(p_description,'')) > 4000 or char_length(coalesce(p_location,'')) > 240 then
   raise exception 'Dados do evento inválidos';
 end if;
 insert into public.agenda_events(title,description,event_date,start_time,end_time,location,event_kind,reminder_minutes,show_in_agenda)
   values(btrim(p_title),p_description,p_event_date,p_start_time,p_end_time,p_location,'general',null,true)
   returning id into v_id;
 perform public.create_coverage_for_event(v_id,p_attendance_owner,p_article_owner,p_audible_minutes,p_checkin_minutes,null);
 return v_id;
end;$$;
revoke all on function public.create_coverage_agenda(text,text,date,time,time,text,uuid,uuid,int,int) from public,anon;
grant execute on function public.create_coverage_agenda(text,text,date,time,time,text,uuid,uuid,int,int) to authenticated;

create or replace function public.create_coverage_pauta(
 p_title text,p_description text,p_event_date date,p_start_time time,p_profiles uuid[],
 p_week_start date,p_show_in_agenda boolean,p_attendance_owner uuid,p_article_owner uuid,
 p_audible_minutes int default 60,p_checkin_minutes int default 5
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_pauta uuid; v_event uuid; v_profiles uuid[];
begin
 if auth.uid() is null or not public.is_agenda_manager() then
   raise exception 'Sem permissão' using errcode='42501';
 end if;
 if p_start_time is null then raise exception 'Cobertura precisa do horário do evento'; end if;
 v_profiles:=array(select distinct x from unnest(coalesce(p_profiles,ARRAY[]::uuid[]) ||
                  array[p_attendance_owner,p_article_owner]) x where x is not null);
 v_pauta := public.create_editorial_pauta_in_period(
  p_title,p_description,p_event_date,p_start_time,v_profiles,p_week_start,p_show_in_agenda
 );
 select agenda_event_id into v_event from public.weekly_pauta_items where id=v_pauta;
 perform public.create_coverage_for_event(v_event,p_attendance_owner,p_article_owner,p_audible_minutes,p_checkin_minutes,null);
 return v_pauta;
end;$$;
revoke all on function public.create_coverage_pauta(text,text,date,time,uuid[],date,boolean,uuid,uuid,int,int) from public,anon;
grant execute on function public.create_coverage_pauta(text,text,date,time,uuid[],date,boolean,uuid,uuid,int,int) to authenticated;

-- Uma transferência solicitada mantém o titular anterior até aceite.
create or replace function public.request_event_coverage_transfer(
 p_event_id uuid,p_part text,p_to uuid,p_reason text,p_force boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype;v_id uuid;v_manager boolean;
begin
 if auth.uid() is null or not public.is_active_staff() then
   raise exception 'Sessão sem acesso' using errcode='42501';
 end if;
 v_manager:=public.is_agenda_manager();
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found then raise exception 'Cobertura não encontrada'; end if;
 if p_part not in ('attendance','article','both') or p_to is null or
      length(btrim(coalesce(p_reason,''))) not between 5 and 300 then
   raise exception 'Dados da transferência inválidos';
 end if;
 if p_force and not v_manager then raise exception 'Somente gestor pode efetivar transferência direta' using errcode='42501'; end if;
 if not v_manager and (
   (p_part='attendance' and v_c.attendance_owner_id<>auth.uid()) or
   (p_part='article' and v_c.article_owner_id<>auth.uid()) or
   (p_part='both' and (v_c.article_owner_id<>auth.uid() or v_c.attendance_owner_id<>auth.uid()))
 ) then raise exception 'Você não é titular desta etapa' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles p
               where p.id=p_to and p.active)
    or not exists(select 1 from public.staff_memberships s where s.profile_id=p_to) then
   raise exception 'Destinatário não é colaborador ativo';
 end if;
 if p_to = (case p_part when 'attendance' then v_c.attendance_owner_id
                         when 'article' then v_c.article_owner_id else null end)
    or (p_part='both' and p_to=v_c.attendance_owner_id and p_to=v_c.article_owner_id) then
   raise exception 'O novo responsável deve ser diferente';
 end if;
 if exists(select 1 from public.event_coverage_transfers where event_id=p_event_id and status='pending') then
   raise exception 'Já há transferência aguardando resposta';
 end if;
 insert into public.event_coverage_transfers
  (event_id,transfer_part,from_attendance_id,from_article_id,to_profile_id,requested_by,
   reason,status,decided_by,decided_at)
 values(p_event_id,p_part,v_c.attendance_owner_id,v_c.article_owner_id,p_to,auth.uid(),
        btrim(p_reason),case when p_force then 'forced' else 'pending' end,
        case when p_force then auth.uid() else null end,
        case when p_force then now() else null end)
 returning id into v_id;
 if p_force then
   perform public.apply_event_coverage_transfer(v_id);
 else
   insert into public.notification_events(app_kind,kind,target_profile_id,title,body,href,dedupe_key)
     select 'sistema','agenda',p_to,
       'Transferência de cobertura para confirmar',
       e.title || ': confirme se assume a responsabilidade.',
       '/sistema/agenda?date='|| e.event_date::text,
       'coverage:transfer:'||v_id::text
     from public.agenda_events e where e.id=p_event_id
     on conflict(dedupe_key) do nothing;
 end if;
 return v_id;
end;$$;

-- Auxiliar privado para efetivar após aceite ou decisão do gestor.
create or replace function public.apply_event_coverage_transfer(p_transfer uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_t public.event_coverage_transfers%rowtype; v_c public.event_coverages%rowtype;
begin
 select * into v_t from public.event_coverage_transfers where id=p_transfer for update;
 if not found or v_t.status not in ('accepted','forced') then raise exception 'Transferência não autorizada'; end if;
 select * into v_c from public.event_coverages where event_id=v_t.event_id for update;
 if v_c.attendance_owner_id is distinct from v_t.from_attendance_id
    or v_c.article_owner_id is distinct from v_t.from_article_id then
    raise exception 'Titularidade foi alterada; atualize a cobertura';
 end if;
 update public.event_coverages set
   attendance_owner_id=case when v_t.transfer_part in ('attendance','both') then v_t.to_profile_id else attendance_owner_id end,
   article_owner_id=case when v_t.transfer_part in ('article','both') then v_t.to_profile_id else article_owner_id end,
   attendance_status=case when v_t.transfer_part in ('attendance','both') then 'pending' else attendance_status end,
   attendance_at=case when v_t.transfer_part in ('attendance','both') then null else attendance_at end,
   updated_by=coalesce(auth.uid(),v_t.decided_by),updated_at=now(),revision=revision+1
 where event_id=v_t.event_id;
 -- Mantém o responsável por escrever na lista de colaboradores.
 insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
 values(v_t.event_id,v_t.to_profile_id,'responsible')
 on conflict(event_id,profile_id) do nothing;
 delete from public.agenda_event_assignees a where a.event_id=v_t.event_id
   and a.profile_id in (v_t.from_attendance_id,v_t.from_article_id)
   and not exists(select 1 from public.event_coverages c where c.event_id=a.event_id
             and a.profile_id in(c.attendance_owner_id,c.article_owner_id));
 update public.weekly_pauta_items
   set responsible_profile_id=(select attendance_owner_id from public.event_coverages where event_id=v_t.event_id)
   where agenda_event_id=v_t.event_id;
 return true;
end;$$;
revoke all on function public.apply_event_coverage_transfer(uuid) from public,anon,authenticated;
-- A função é chamada apenas internamente por funções aprovadas.

revoke all on function public.request_event_coverage_transfer(uuid,text,uuid,text,boolean) from public,anon;
grant execute on function public.request_event_coverage_transfer(uuid,text,uuid,text,boolean) to authenticated;

create or replace function public.respond_event_coverage_transfer(
 p_transfer uuid,p_accept boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_t public.event_coverage_transfers%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then raise exception 'Sem acesso' using errcode='42501'; end if;
 select * into v_t from public.event_coverage_transfers where id=p_transfer for update;
 if not found or v_t.status <> 'pending' then raise exception 'Transferência indisponível'; end if;
 if v_t.to_profile_id <> auth.uid() then raise exception 'Somente o destinatário pode responder' using errcode='42501'; end if;
 update public.event_coverage_transfers set
   status=case when p_accept then 'accepted' else 'declined' end,
   decided_by=auth.uid(),decided_at=now() where id=p_transfer;
 if p_accept then perform public.apply_event_coverage_transfer(p_transfer); end if;
 return true;
end;$$;
revoke all on function public.respond_event_coverage_transfer(uuid,boolean) from public,anon;
grant execute on function public.respond_event_coverage_transfer(uuid,boolean) to authenticated;

create or replace function public.mark_event_coverage_attendance(
 p_event_id uuid,p_status text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then raise exception 'Sem acesso' using errcode='42501';end if;
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found or auth.uid()<>v_c.attendance_owner_id then
   raise exception 'Só o titular atual pode registrar seu comparecimento' using errcode='42501';
 end if;
 if p_status not in ('on_way','present','absent') then raise exception 'Resposta de presença inválida'; end if;
 if exists(select 1 from public.event_coverage_transfers t where t.event_id=p_event_id and t.status='pending')
   and p_status='absent' then raise exception 'Aguarde transferência ou cancele a solicitação'; end if;
 update public.event_coverages set attendance_status=p_status,
  attendance_at=case when p_status in ('present','absent') then now() else null end,
  updated_by=auth.uid(),updated_at=now()
 where event_id=p_event_id;
 return true;
end;$$;
revoke all on function public.mark_event_coverage_attendance(uuid,text) from public,anon;
grant execute on function public.mark_event_coverage_attendance(uuid,text) to authenticated;

create or replace function public.set_event_coverage_article(
 p_event_id uuid,p_completed boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then raise exception 'Sem acesso' using errcode='42501';end if;
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found then raise exception 'Cobertura não encontrada'; end if;
 if auth.uid()<>v_c.article_owner_id and not public.is_agenda_manager() then
   raise exception 'Somente redator designado ou gestor pode concluir a matéria' using errcode='42501'; end if;
 update public.event_coverages set article_status=case when p_completed then 'completed' else 'pending' end,
    article_completed_at=case when p_completed then now() else null end,
    updated_by=auth.uid(),updated_at=now() where event_id=p_event_id;
 update public.agenda_events set status=case when p_completed then 'completed' else 'scheduled' end,
    completed_at=case when p_completed then now() else null end,
    updated_by=auth.uid(),updated_at=now() where id=p_event_id and status<>'cancelled';
 return true;
end;$$;
revoke all on function public.set_event_coverage_article(uuid,boolean) from public,anon;
grant execute on function public.set_event_coverage_article(uuid,boolean) to authenticated;

create or replace function public.set_event_coverage_alerts(
 p_event_id uuid,p_audible_minutes integer,p_checkin_minutes integer,p_article_due_at timestamptz default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_c public.event_coverages%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then raise exception 'Sem acesso' using errcode='42501';end if;
 select * into v_c from public.event_coverages where event_id=p_event_id for update;
 if not found then raise exception 'Cobertura não encontrada'; end if;
 if auth.uid()<>v_c.attendance_owner_id and not public.is_agenda_manager() then
   raise exception 'Somente titular ou gestor pode ajustar lembretes' using errcode='42501';end if;
 if p_audible_minutes not between -1440 and 1440 or p_checkin_minutes not between -120 and 120 then
   raise exception 'Intervalo de alerta inválido';
 end if;
 update public.event_coverages set audible_minutes=p_audible_minutes,
   checkin_minutes=p_checkin_minutes,article_due_at=p_article_due_at,
   revision=revision+1,updated_by=auth.uid(),updated_at=now()
 where event_id=p_event_id;
 return true;
end;$$;
revoke all on function public.set_event_coverage_alerts(uuid,integer,integer,timestamptz) from public,anon;
grant execute on function public.set_event_coverage_alerts(uuid,integer,integer,timestamptz) to authenticated;

-- Bloqueia conclusão acidental pelo botão antigo da Agenda/Pauta.
create or replace function public.guard_coverage_before_agenda_complete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' and exists (
  select 1 from public.event_coverages c
  where c.event_id=new.id and c.article_status<>'completed'
 ) then
   raise exception 'Cobertura em andamento: conclua primeiro a matéria.';
 end if;
 return new;
end;$$;
create trigger guard_coverage_event_complete before update of status on public.agenda_events
  for each row execute function public.guard_coverage_before_agenda_complete();

-- Realtime para atualizar as duas telas sem polling desnecessário.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='event_coverages') then
  alter publication supabase_realtime add table public.event_coverages;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='event_coverage_transfers') then
  alter publication supabase_realtime add table public.event_coverage_transfers;
 end if;
end $$;
