-- Pauta do jornal: semanas canônicas de quinta a quarta, com ajustes por semana
-- compartilhados entre PC e aplicativo. Sem apagar tarefas ou compromissos antigos.
-- Não alterar a semana civil usada pela Agenda de compromissos.

create or replace function public.pauta_week_start(p_date date)
returns date language sql immutable strict set search_path = '' as $$
  select (p_date - ((extract(dow from p_date)::integer + 3) % 7))::date;
$$;
revoke all on function public.pauta_week_start(date) from public;
grant execute on function public.pauta_week_start(date) to anon, authenticated, service_role;

-- Registros antigos guardam a segunda-feira, mas o próprio compromisso é
-- a fonte verdadeira da data. Reancorar o registro, mantendo ID, status e autor.
alter table public.weekly_pauta_items
  drop constraint if exists weekly_pauta_week_monday;
alter table public.weekly_pauta_items
  drop constraint if exists weekly_pauta_due_in_week;

update public.weekly_pauta_items p
set week_start = public.pauta_week_start(coalesce(e.event_date, p.due_date, p.week_start))
from public.agenda_events e
where e.id = p.agenda_event_id
  and p.week_start is distinct from public.pauta_week_start(coalesce(e.event_date, p.due_date, p.week_start));

update public.weekly_pauta_items p
set week_start = public.pauta_week_start(coalesce(p.due_date, p.week_start))
where p.agenda_event_id is null
  and p.week_start is distinct from public.pauta_week_start(coalesce(p.due_date, p.week_start));

alter table public.weekly_pauta_items
  add constraint weekly_pauta_week_thursday check (extract(isodow from week_start) = 4);
-- Permite exceções curtas de calendário sem invalidar dados históricos;
-- criação de novas pautas valida o período editado na função transacional.
alter table public.weekly_pauta_items
  add constraint weekly_pauta_due_reasonable check (
    due_date is null or (due_date >= week_start - 3 and due_date <= week_start + 10)
  );

-- Internamente toda pauta continua tendo uma identidade e responsáveis no
-- modelo unificado. Esta flag controla somente sua presença na Agenda visual.
alter table public.agenda_events
  add column if not exists show_in_agenda boolean not null default true;
comment on column public.agenda_events.show_in_agenda is
  'false: pauta editorial visível na Pauta, mas não na lista/calendário da Agenda.';

create table if not exists public.pauta_week_overrides (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  period_start date not null,
  period_end date not null,
  reason text not null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  updated_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pauta_override_anchor_thursday check (extract(isodow from week_start) = 4),
  constraint pauta_override_bounds check (
    period_start between week_start - 3 and week_start + 6
    and period_end between period_start and week_start + 10
  ),
  constraint pauta_override_reason check (char_length(btrim(reason)) between 5 and 300)
);
comment on table public.pauta_week_overrides is
  'Exceções compartilhadas da Pauta: ancoradas na quinta-feira canônica; não movem nem apagam itens.';
create trigger pauta_week_overrides_timestamp
  before update on public.pauta_week_overrides
  for each row execute function public.set_updated_at();
create trigger pauta_week_overrides_audit
  after insert or update or delete on public.pauta_week_overrides
  for each row execute function public.audit_agenda_change();

alter table public.pauta_week_overrides enable row level security;
revoke all on public.pauta_week_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.pauta_week_overrides to authenticated;
grant all on public.pauta_week_overrides to service_role;

create policy pauta_period_staff_read on public.pauta_week_overrides
  for select to authenticated using ((select public.has_staff_module_access('pauta', false)));
create policy pauta_period_manager_insert on public.pauta_week_overrides
  for insert to authenticated with check (
    (select public.is_agenda_manager()) and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );
create policy pauta_period_manager_update on public.pauta_week_overrides
  for update to authenticated
  using ((select public.is_agenda_manager()))
  with check ((select public.is_agenda_manager()) and updated_by = (select auth.uid()));
create policy pauta_period_manager_delete on public.pauta_week_overrides
  for delete to authenticated using ((select public.is_agenda_manager()));

-- Uma atualização atômica, auditada, restrita ao proprietário/gestor de pauta.
-- Datas iguais ao padrão removem só a exceção, não alteram outras semanas.
create or replace function public.save_pauta_week_override(
  p_week_start date, p_period_start date, p_period_end date, p_reason text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_agenda_manager() then
    raise exception 'Sem permissão para alterar o período da Pauta.' using errcode='42501';
  end if;
  if p_week_start is null or public.pauta_week_start(p_week_start) <> p_week_start
     or p_period_start is null or p_period_end is null
     or p_period_start < p_week_start - 3 or p_period_start > p_week_start + 6
     or p_period_end < p_period_start or p_period_end > p_week_start + 10 then
    raise exception 'Período inválido: confira as datas da semana.' using errcode='23514';
  end if;
  if p_period_start = p_week_start and p_period_end = p_week_start + 6 then
    delete from public.pauta_week_overrides where week_start = p_week_start;
    return true;
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 5 and 300 then
    raise exception 'Informe o motivo da alteração (5 a 300 caracteres).' using errcode='23514';
  end if;
  insert into public.pauta_week_overrides
    (week_start,period_start,period_end,reason,created_by,updated_by)
  values (p_week_start,p_period_start,p_period_end,btrim(p_reason),auth.uid(),auth.uid())
  on conflict (week_start) do update set
    period_start=excluded.period_start,period_end=excluded.period_end,
    reason=excluded.reason,updated_by=auth.uid(),updated_at=now();
  return true;
end;
$$;
revoke all on function public.save_pauta_week_override(date,date,date,text) from public, anon;
grant execute on function public.save_pauta_week_override(date,date,date,text) to authenticated;

-- A identidade editorial unificada e a conclusão por responsável continuam
-- funcionando; o novo parâmetro só decide exibição na Agenda.
create or replace function public.create_editorial_pauta_in_period(
  p_title text, p_description text, p_event_date date, p_start_time time,
  p_profile_ids uuid[], p_week_start date, p_show_in_agenda boolean
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_event uuid; v_pauta uuid; v_start date; v_end date;
begin
  if not public.is_agenda_manager() then
    raise exception 'Sem permissão para criar pautas' using errcode='42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 180 or p_event_date is null
     or p_week_start is null or public.pauta_week_start(p_week_start) <> p_week_start then
    raise exception 'Título, dia ou semana inválidos.' using errcode='23514';
  end if;
  select period_start, period_end into v_start,v_end
    from public.pauta_week_overrides where week_start=p_week_start;
  if not found then v_start := p_week_start; v_end := p_week_start + 6; end if;
  if p_event_date < v_start or p_event_date > v_end then
    raise exception 'O dia da pauta deve estar dentro do período escolhido.' using errcode='23514';
  end if;
  if coalesce(cardinality(p_profile_ids),0) > 30 or exists (
    select 1 from unnest(coalesce(p_profile_ids,array[]::uuid[])) ids(id)
    left join public.profiles p on p.id=ids.id and p.active
    where p.id is null
  ) then
    raise exception 'Responsável inválido ou inativo.' using errcode='23514';
  end if;
  insert into public.agenda_events
    (title,description,event_date,start_time,event_kind,reminder_minutes,show_in_agenda)
  values (btrim(p_title),p_description,p_event_date,p_start_time,'editorial',null,
          coalesce(p_show_in_agenda,false))
  returning id into v_event;
  insert into public.agenda_event_assignees(event_id,profile_id)
    select v_event,ids.id from (select distinct unnest(coalesce(p_profile_ids,array[]::uuid[])) id) ids;
  insert into public.weekly_pauta_items
    (week_start,title,description,due_date,due_time,responsible_profile_id,agenda_event_id)
  values (
    p_week_start,btrim(p_title),p_description,p_event_date,p_start_time,
    (select id from unnest(coalesce(p_profile_ids,array[]::uuid[])) ids(id) order by id limit 1),
    v_event
  ) returning id into v_pauta;
  return v_pauta;
end;
$$;
revoke all on function public.create_editorial_pauta_in_period(text,text,date,time,uuid[],date,boolean) from public, anon;
grant execute on function public.create_editorial_pauta_in_period(text,text,date,time,uuid[],date,boolean) to authenticated;

-- Compatibilidade com clientes antigos durante a publicação.
create or replace function public.create_editorial_pauta_event(
  p_title text,p_description text,p_event_date date,p_start_time time,p_profile_ids uuid[]
) returns uuid language plpgsql security invoker set search_path='' as $$
begin
  return public.create_editorial_pauta_in_period(
    p_title,p_description,p_event_date,p_start_time,p_profile_ids,
    public.pauta_week_start(p_event_date),true
  );
end;
$$;

-- Compromisso incluído na Pauta a partir da Agenda conserva sua visibilidade.
create or replace function public.add_agenda_event_to_pauta(p_event_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_event public.agenda_events%rowtype; v_pauta uuid; v_responsible uuid;
begin
  if not public.is_agenda_manager() then raise exception 'Sem permissão para incluir na pauta'; end if;
  select * into v_event from public.agenda_events where id=p_event_id for update;
  if not found then raise exception 'Compromisso não encontrado'; end if;
  select p.id into v_pauta from public.weekly_pauta_items p
    where p.agenda_event_id=p_event_id
    order by case when p.status='cancelled' then 1 else 0 end,p.created_at desc limit 1;
  if v_pauta is not null then raise exception 'Compromisso já está na pauta'; end if;
  update public.agenda_events set event_kind='editorial',show_in_agenda=true where id=p_event_id;
  select profile_id into v_responsible from public.agenda_event_assignees
    where event_id=p_event_id and assignment_type='responsible'
    order by created_at,profile_id limit 1;
  insert into public.weekly_pauta_items(
    week_start,title,description,due_date,due_time,
    responsible_profile_id,agenda_event_id,status
  ) values (
    public.pauta_week_start(v_event.event_date),
    v_event.title,v_event.description,v_event.event_date,v_event.start_time,
    v_responsible,v_event.id,
    case v_event.status when 'completed' then 'completed'
      when 'cancelled' then 'cancelled' else 'pending' end
  ) returning id into v_pauta;
  return v_pauta;
end;
$$;

-- Se alterar um item dentro do período excepcional, conservar sua semana
-- editorial; fora dela, reancorar à quinta-feira canônica de sua nova data.
create or replace function public.sync_pauta_snapshot_from_agenda()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.event_kind <> 'editorial' then return new; end if;
  if (new.title,new.description,new.event_date,new.start_time,new.status,new.completed_at)
     is not distinct from
     (old.title,old.description,old.event_date,old.start_time,old.status,old.completed_at)
     and new.event_kind is not distinct from old.event_kind
  then return new; end if;
  update public.weekly_pauta_items p set
    title=new.title,description=new.description,
    due_date=new.event_date,due_time=new.start_time,
    week_start=case when exists (
      select 1 from public.pauta_week_overrides o
      where o.week_start=p.week_start and new.event_date between o.period_start and o.period_end
    ) then p.week_start else public.pauta_week_start(new.event_date) end,
    status=case new.status when 'completed' then 'completed'
      when 'cancelled' then 'cancelled' else 'pending' end,
    completed_at=new.completed_at,
    completed_by=case when new.status='completed' then coalesce(p.completed_by,auth.uid()) else null end
  where p.id=(
    select q.id from public.weekly_pauta_items q
    where q.agenda_event_id=new.id
    order by case when q.status='cancelled' then 1 else 0 end,q.created_at desc
    limit 1
  );
  return new;
end;
$$;

-- Os clientes conectados à Pauta veem exceções alteradas por colegas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='pauta_week_overrides'
  ) then
    alter publication supabase_realtime add table public.pauta_week_overrides;
  end if;
end $$;
