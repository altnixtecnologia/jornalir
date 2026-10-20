-- Agenda/Pauta: leitura coletiva, gestao explicitamente delegada e baixa individual.
-- Implantar com a versao de aplicacao que usa as RPCs abaixo.
alter table public.agenda_event_assignees
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id);

create table if not exists public.agenda_manager_grants (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  can_manage boolean not null default false,
  granted_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.agenda_manager_grants enable row level security;
revoke all on public.agenda_manager_grants from anon, authenticated;
grant select, insert, update, delete on public.agenda_manager_grants to authenticated;

create policy agenda_manager_grants_select on public.agenda_manager_grants
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_active_owner()));
create policy agenda_manager_grants_insert on public.agenda_manager_grants
  for insert to authenticated
  with check ((select public.is_active_owner()) and
    exists (select 1 from public.profiles p where p.id = profile_id and p.role = 'admin' and p.active));
create policy agenda_manager_grants_update on public.agenda_manager_grants
  for update to authenticated
  using ((select public.is_active_owner()))
  with check ((select public.is_active_owner()) and
    exists (select 1 from public.profiles p where p.id = profile_id and p.role = 'admin' and p.active));
create policy agenda_manager_grants_delete on public.agenda_manager_grants
  for delete to authenticated using ((select public.is_active_owner()));

create or replace function public.is_agenda_manager()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and
      (p.role = 'owner' or
       (p.role = 'admin' and exists (
         select 1 from public.agenda_manager_grants g
         where g.profile_id = p.id and g.can_manage
       )))
  );
$$;
revoke all on function public.is_agenda_manager() from public, anon;
grant execute on function public.is_agenda_manager() to authenticated;

create or replace function public.has_staff_module_access(p_module text, p_write boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_module in ('agenda', 'pauta') then
      case when p_write then public.is_agenda_manager() else public.is_active_staff() end
    else exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and p.active
      and (p.role in ('owner','admin') or
           (p.role='operator' and exists (
             select 1 from public.staff_module_permissions m
             where m.profile_id=p.id and m.module_name=p_module
               and (case when p_write then m.can_write else m.can_read end)
           )))
    )
  end;
$$;
revoke all on function public.has_staff_module_access(text,boolean) from public, anon;
grant execute on function public.has_staff_module_access(text,boolean) to authenticated;

-- RLS: todos os membros ativos leem; alteracao geral apenas por gestores.
drop policy if exists agenda_events_update_staff on public.agenda_events;
create policy agenda_events_update_staff on public.agenda_events
  for update to authenticated using ((select public.is_agenda_manager()))
  with check ((select public.is_agenda_manager()));
drop policy if exists agenda_events_insert_staff on public.agenda_events;
create policy agenda_events_insert_staff on public.agenda_events
  for insert to authenticated with check ((select public.is_agenda_manager()) and created_by=(select auth.uid()));

drop policy if exists agenda_event_assignees_insert_staff on public.agenda_event_assignees;
create policy agenda_event_assignees_insert_staff on public.agenda_event_assignees
  for insert to authenticated with check ((select public.is_agenda_manager()) and created_by=(select auth.uid()));
drop policy if exists agenda_event_assignees_update_staff on public.agenda_event_assignees;
create policy agenda_event_assignees_update_staff on public.agenda_event_assignees
  for update to authenticated using ((select public.is_agenda_manager()))
  with check ((select public.is_agenda_manager()));
drop policy if exists agenda_event_assignees_delete_staff on public.agenda_event_assignees;
create policy agenda_event_assignees_delete_staff on public.agenda_event_assignees
  for delete to authenticated using ((select public.is_agenda_manager()));

drop policy if exists weekly_pauta_items_insert_staff on public.weekly_pauta_items;
create policy weekly_pauta_items_insert_staff on public.weekly_pauta_items
  for insert to authenticated with check ((select public.is_agenda_manager()) and created_by=(select auth.uid()));
drop policy if exists weekly_pauta_items_update_staff on public.weekly_pauta_items;
create policy weekly_pauta_items_update_staff on public.weekly_pauta_items
  for update to authenticated using ((select public.is_agenda_manager()))
  with check ((select public.is_agenda_manager()));

-- A funcao tem privilegio elevado, mas valida identidade, equipe ativa e autoria,
-- e somente permite concluir a propria atribuicao, sem editar outros campos.
create or replace function public.complete_my_agenda_assignment(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_status text;
begin
  if v_user is null or not public.is_active_staff() then
    raise exception 'Acesso negado';
  end if;
  select status into v_status from public.agenda_events where id=p_event_id for update;
  if v_status is distinct from 'scheduled' then
    raise exception 'Compromisso nao esta pendente';
  end if;
  if not exists (
    select 1 from public.agenda_event_assignees
    where event_id=p_event_id and profile_id=v_user and assignment_type='responsible'
  ) then raise exception 'Voce nao e responsavel por este compromisso'; end if;
  update public.agenda_event_assignees
     set completed_at=coalesce(completed_at,now()), completed_by=v_user
   where event_id=p_event_id and profile_id=v_user and assignment_type='responsible'
     and completed_at is null;
  if not exists (
    select 1 from public.agenda_event_assignees
     where event_id=p_event_id and assignment_type='responsible' and completed_at is null
  ) then
    update public.agenda_events
       set status='completed',completed_at=now(),updated_by=v_user,updated_at=now()
     where id=p_event_id;
  end if;
  return true;
end $$;
revoke all on function public.complete_my_agenda_assignment(uuid) from public, anon;
grant execute on function public.complete_my_agenda_assignment(uuid) to authenticated;

create or replace function public.set_agenda_status_managed(p_event_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_agenda_manager() then raise exception 'Sem permissao para alterar outros compromissos'; end if;
  if p_status not in ('scheduled','completed','cancelled') then raise exception 'Status invalido'; end if;
  perform 1 from public.agenda_events where id=p_event_id for update;
  if not found then raise exception 'Compromisso nao encontrado'; end if;
  if p_status='scheduled' then
    update public.agenda_event_assignees
       set completed_at=null, completed_by=null where event_id=p_event_id;
  elsif p_status='completed' then
    update public.agenda_event_assignees
       set completed_at=coalesce(completed_at,now()), completed_by=coalesce(completed_by,auth.uid())
     where event_id=p_event_id and assignment_type='responsible';
  end if;
  update public.agenda_events
     set status=p_status,completed_at=case when p_status='completed' then now() else null end,
         updated_by=auth.uid(),updated_at=now()
   where id=p_event_id;
  return true;
end $$;
revoke all on function public.set_agenda_status_managed(uuid,text) from public,anon;
grant execute on function public.set_agenda_status_managed(uuid,text) to authenticated;

create or replace function public.complete_my_pauta_item(p_item_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_row public.weekly_pauta_items%rowtype;
begin
  if v_user is null or not public.is_active_staff() then raise exception 'Acesso negado'; end if;
  select * into v_row from public.weekly_pauta_items where id=p_item_id for update;
  if not found or v_row.status <> 'pending' then raise exception 'Pauta nao esta pendente'; end if;
  if v_row.responsible_profile_id is distinct from v_user then raise exception 'Esta pauta nao e sua'; end if;
  update public.weekly_pauta_items
     set status='completed',completed_at=now(),completed_by=v_user,updated_by=v_user,updated_at=now()
   where id=p_item_id;
  -- As etapas editoriais antigas permanecem independentes ate a unificacao de dados.
  return true;
end $$;
revoke all on function public.complete_my_pauta_item(uuid) from public,anon;
grant execute on function public.complete_my_pauta_item(uuid) to authenticated;

create or replace function public.set_pauta_status_managed(p_item_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_agenda_manager() then raise exception 'Sem permissao para alterar pendencias'; end if;
  if p_status not in ('pending','completed','cancelled') then raise exception 'Status invalido'; end if;
  update public.weekly_pauta_items
     set status=p_status,
         completed_at=case when p_status='completed' then now() else null end,
         completed_by=case when p_status='completed' then auth.uid() else null end,
         updated_by=auth.uid(),updated_at=now()
   where id=p_item_id;
  if not found then raise exception 'Pauta nao encontrada'; end if;
  return true;
end $$;
revoke all on function public.set_pauta_status_managed(uuid,text) from public,anon;
grant execute on function public.set_pauta_status_managed(uuid,text) to authenticated;

-- Auditoria transacional dos tres registros operacionais. Nao grava descricoes
-- livres nem segredos; os detalhes completos de outros modulos serao revisados
-- numa etapa separada para evitar vazamento de dados sensiveis.
create or replace function public.audit_agenda_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_old jsonb; v_new jsonb; v_id uuid; v_entity text;
begin
  v_old := case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
  v_new := case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
  v_entity := TG_TABLE_NAME;
  v_id := coalesce((v_new->>'id')::uuid,(v_old->>'id')::uuid,
                   (v_new->>'event_id')::uuid,(v_old->>'event_id')::uuid,
                   (v_new->>'profile_id')::uuid,(v_old->>'profile_id')::uuid);
  v_old := v_old - 'description' - 'created_at' - 'updated_at';
  v_new := v_new - 'description' - 'created_at' - 'updated_at';
  if TG_OP='UPDATE' and v_old=v_new then return NEW; end if;
  insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),v_entity,v_id,
    case TG_OP when 'INSERT' then 'create' when 'DELETE' then 'delete' else 'update' end,
    jsonb_build_object('before',v_old,'after',v_new,'source','db_trigger'));
  return coalesce(NEW,OLD);
end $$;

drop trigger if exists agenda_events_audit_change on public.agenda_events;
create trigger agenda_events_audit_change
  after insert or update or delete on public.agenda_events
  for each row execute function public.audit_agenda_change();
drop trigger if exists agenda_assignees_audit_change on public.agenda_event_assignees;
create trigger agenda_assignees_audit_change
  after insert or update or delete on public.agenda_event_assignees
  for each row execute function public.audit_agenda_change();
drop trigger if exists weekly_pauta_audit_change on public.weekly_pauta_items;
create trigger weekly_pauta_audit_change
  after insert or update or delete on public.weekly_pauta_items
  for each row execute function public.audit_agenda_change();

-- Realtime autorizado via RLS: permite invalidacao automatica do painel.
do $$
declare v_table text;
begin
  foreach v_table in array array['agenda_events','agenda_event_assignees','weekly_pauta_items'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end $$;

drop trigger if exists agenda_manager_grants_audit_change on public.agenda_manager_grants;
create trigger agenda_manager_grants_audit_change
  after insert or update or delete on public.agenda_manager_grants
  for each row execute function public.audit_agenda_change();
