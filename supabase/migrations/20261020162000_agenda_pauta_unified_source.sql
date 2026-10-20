-- Fonte unica: agenda_events concentra identidade, data, descricao, responsaveis e status.
-- weekly_pauta_items permanece como extensao editorial (article_id, sort_order)
-- e para manter vinculos antigos de matérias. Nunca apagar pautas preexistentes.
alter table public.agenda_events
  add column if not exists event_kind text not null default 'general'
  check (event_kind in ('general','editorial'));
create index if not exists agenda_events_kind_date_idx
  on public.agenda_events(event_kind,event_date,status);

-- Preservar as pautas antigas. Vínculos existentes tornam-se editoriais.
update public.agenda_events e set event_kind='editorial'
from public.weekly_pauta_items p
where p.agenda_event_id=e.id and e.event_kind <> 'editorial';

-- Nunca truncar silenciosamente pautas legadas com titulos acima do limite da Agenda.
do $
begin
  if exists (select 1 from public.weekly_pauta_items
             where agenda_event_id is null and char_length(title)>180) then
    raise exception 'Há pautas antigas com títulos maiores que 180 caracteres. Revisar antes de migrar, sem truncar dados.';
  end if;
end $;

do $
declare p record; v_event uuid;
begin
  for p in
    select * from public.weekly_pauta_items
    where agenda_event_id is null
    order by created_at,id
  loop
    insert into public.agenda_events(
      title,description,event_date,start_time,status,completed_at,
      created_by,updated_by,created_at,event_kind,reminder_minutes
    )
    values (
      p.title,p.description,coalesce(p.due_date,p.week_start),
      p.due_time,case p.status when 'completed' then 'completed'
        when 'cancelled' then 'cancelled' else 'scheduled' end,
      p.completed_at,p.created_by,p.updated_by,p.created_at,'editorial',null
    ) returning id into v_event;
    if p.responsible_profile_id is not null then
      insert into public.agenda_event_assignees(
        event_id,profile_id,assignment_type,created_by,completed_at,completed_by
      ) values (
        v_event,p.responsible_profile_id,'responsible',p.created_by,
        case when p.status='completed' then coalesce(p.completed_at,now()) else null end,
        case when p.status='completed' then coalesce(p.completed_by,p.created_by) else null end
      );
    end if;
    update public.weekly_pauta_items set agenda_event_id=v_event where id=p.id;
  end loop;
end $$;

-- As colunas espelhadas da pauta sao snapshots de compatibilidade, jamais
-- a fonte de verdade. Atualizar automaticamente quando a Agenda muda.
create or replace function public.sync_pauta_snapshot_from_agenda()
returns trigger language plpgsql security definer set search_path=''
as $$
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
    week_start=(date_trunc('week',new.event_date::timestamp))::date,
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
end $$;
drop trigger if exists agenda_events_sync_editorial_pauta on public.agenda_events;
create trigger agenda_events_sync_editorial_pauta
  after update on public.agenda_events for each row
  execute function public.sync_pauta_snapshot_from_agenda();

-- Cadastro da Pauta sempre cria compromisso na Agenda + responsavel, na mesma transacao.
create or replace function public.create_editorial_pauta_event(
  p_title text,p_description text,p_event_date date,p_start_time time,p_profile_ids uuid[]
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_event uuid; v_pauta uuid;
begin
  if not public.is_agenda_manager() then raise exception 'Sem permissão para criar pautas'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 180 or p_event_date is null
  then raise exception 'Informe título (até 180 caracteres) e dia válido'; end if;
  if exists (select 1 from unnest(coalesce(p_profile_ids,array[]::uuid[])) ids(id)
    left join public.profiles p on p.id=ids.id and p.active
    where p.id is null) then raise exception 'Responsável inativo ou inexistente'; end if;

  insert into public.agenda_events(
    title,description,event_date,start_time,event_kind,reminder_minutes
  ) values(btrim(p_title),p_description,p_event_date,p_start_time,'editorial',null)
  returning id into v_event;
  insert into public.agenda_event_assignees(event_id,profile_id)
  select v_event,ids.id from (
    select distinct unnest(coalesce(p_profile_ids,array[]::uuid[])) id
  ) ids;
  insert into public.weekly_pauta_items(
    week_start,title,description,due_date,due_time,responsible_profile_id,agenda_event_id
  ) values (
    date_trunc('week',p_event_date::timestamp)::date,
    btrim(p_title),p_description,p_event_date,p_start_time,
    (select id from unnest(coalesce(p_profile_ids,array[]::uuid[])) ids(id) order by id limit 1),v_event
  ) returning id into v_pauta;
  return v_pauta;
end $$;
revoke all on function public.create_editorial_pauta_event(text,text,date,time,uuid[]) from public,anon;
grant execute on function public.create_editorial_pauta_event(text,text,date,time,uuid[]) to authenticated;

-- A edição atua APENAS em Agenda; o espelho é mantido pelo trigger.
-- Controle otimista impede sobrescrever alterações de colegas.
create or replace function public.update_editorial_pauta_event(
  p_pauta_id uuid,p_title text,p_description text,p_event_date date,
  p_start_time time,p_profile_ids uuid[],p_expected_updated_at timestamptz
) returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_event uuid; v_previous timestamptz;
begin
  if not public.is_agenda_manager() then raise exception 'Sem permissão para editar pautas'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 180 or p_event_date is null
  then raise exception 'Informe título (até 180 caracteres) e dia válido'; end if;
  select agenda_event_id into v_event from public.weekly_pauta_items
    where id=p_pauta_id;
  if v_event is null then raise exception 'Pauta não vinculada à Agenda'; end if;
  select updated_at into v_previous from public.agenda_events where id=v_event for update;
  if not found then raise exception 'Compromisso não encontrado'; end if;
  if v_previous is distinct from p_expected_updated_at then
    raise exception 'Este compromisso foi alterado por outra pessoa. Atualize antes de salvar.';
  end if;
  if exists (select 1 from unnest(coalesce(p_profile_ids,array[]::uuid[])) ids(id)
    left join public.profiles p on p.id=ids.id and p.active
    where p.id is null) then raise exception 'Responsável inativo ou inexistente'; end if;

  update public.agenda_events set
    title=btrim(p_title),description=p_description,event_date=p_event_date,
    start_time=p_start_time,updated_by=auth.uid(),updated_at=now()
  where id=v_event;

  delete from public.agenda_event_assignees
  where event_id=v_event and assignment_type='responsible'
    and not (profile_id=any(coalesce(p_profile_ids,array[]::uuid[])));
  insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
  select v_event,ids.id,'responsible' from (
    select distinct unnest(coalesce(p_profile_ids,array[]::uuid[])) id
  ) ids on conflict(event_id,profile_id) do nothing;
  update public.weekly_pauta_items
  set responsible_profile_id=(
    select id from unnest(coalesce(p_profile_ids,array[]::uuid[])) ids(id) order by id limit 1
  ) where id=p_pauta_id;
  return true;
end $$;
revoke all on function public.update_editorial_pauta_event(uuid,text,text,date,time,uuid[],timestamptz) from public,anon;
grant execute on function public.update_editorial_pauta_event(uuid,text,text,date,time,uuid[],timestamptz) to authenticated;

-- Um compromisso geral pode passar a compor a pauta, sem duplicar Agenda.
create or replace function public.add_agenda_event_to_pauta(p_event_id uuid)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_event public.agenda_events%rowtype; v_pauta uuid; v_responsible uuid;
begin
  if not public.is_agenda_manager() then raise exception 'Sem permissão para incluir na pauta'; end if;
  select * into v_event from public.agenda_events where id=p_event_id for update;
  if not found then raise exception 'Compromisso não encontrado'; end if;
  select p.id into v_pauta from public.weekly_pauta_items p
    where p.agenda_event_id=p_event_id
    order by case when p.status='cancelled' then 1 else 0 end,p.created_at desc limit 1;
  if v_pauta is not null then raise exception 'Compromisso já está na pauta'; end if;

  update public.agenda_events set event_kind='editorial' where id=p_event_id;
  select profile_id into v_responsible from public.agenda_event_assignees
    where event_id=p_event_id and assignment_type='responsible'
    order by created_at,profile_id limit 1;
  insert into public.weekly_pauta_items(
    week_start,title,description,due_date,due_time,
    responsible_profile_id,agenda_event_id,status
  ) values(
    date_trunc('week',v_event.event_date::timestamp)::date,
    v_event.title,v_event.description,v_event.event_date,v_event.start_time,
    v_responsible,v_event.id,
    case v_event.status when 'completed' then 'completed'
      when 'cancelled' then 'cancelled' else 'pending' end
  ) returning id into v_pauta;
  return v_pauta;
end $$;
revoke all on function public.add_agenda_event_to_pauta(uuid) from public,anon;
grant execute on function public.add_agenda_event_to_pauta(uuid) to authenticated;

-- Baixa a partir da Pauta utiliza a MESMA baixa individual da Agenda.
create or replace function public.complete_my_pauta_item(p_item_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_event uuid;
begin
  if not public.is_active_staff() then raise exception 'Sem acesso'; end if;
  select agenda_event_id into v_event from public.weekly_pauta_items where id=p_item_id;
  if v_event is null then raise exception 'Pauta sem compromisso vinculado'; end if;
  return public.complete_my_agenda_assignment(v_event);
end $$;
revoke all on function public.complete_my_pauta_item(uuid) from public,anon;
grant execute on function public.complete_my_pauta_item(uuid) to authenticated;

-- Reabertura, cancelamento e baixa administrativa também propagam para a Agenda.
create or replace function public.set_pauta_status_managed(p_item_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_event uuid;
begin
  if not public.is_agenda_manager() then raise exception 'Sem permissão'; end if;
  if p_status not in ('pending','completed','cancelled') then raise exception 'Status inválido'; end if;
  select agenda_event_id into v_event from public.weekly_pauta_items where id=p_item_id;
  if v_event is null then raise exception 'Pauta sem compromisso vinculado'; end if;
  return public.set_agenda_status_managed(v_event,
    case p_status when 'pending' then 'scheduled'
      when 'completed' then 'completed' else 'cancelled' end);
end $$;
revoke all on function public.set_pauta_status_managed(uuid,text) from public,anon;
grant execute on function public.set_pauta_status_managed(uuid,text) to authenticated;


-- Um responsavel incluido/removido na Agenda reflete no indice editorial.
-- Participantes convidados nao entram na baixa de tarefas.
create or replace function public.sync_pauta_primary_assignee()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_event uuid; v_primary uuid;
begin
  v_event := case when tg_op='DELETE' then old.event_id else new.event_id end;
  if tg_op='UPDATE' and old.event_id is distinct from new.event_id then
    raise exception 'Não é permitido mover uma atribuição de compromisso por UPDATE';
  end if;
  select a.profile_id into v_primary
  from public.agenda_event_assignees a
  where a.event_id=v_event and a.assignment_type='responsible'
  order by a.profile_id limit 1;
  update public.weekly_pauta_items
  set responsible_profile_id=v_primary
  where agenda_event_id=v_event and responsible_profile_id is distinct from v_primary;
  return coalesce(new,old);
end $$;
drop trigger if exists pauta_primary_assignee_sync on public.agenda_event_assignees;
create trigger pauta_primary_assignee_sync
  after insert or update or delete on public.agenda_event_assignees
  for each row execute function public.sync_pauta_primary_assignee();
