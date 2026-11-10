-- Jornal IR — coproprietário de gestão dentro do painel, sem poderes técnicos.
-- O 'owner' permanece único e exclusivo. Nenhum acesso a GitHub,
-- Supabase Dashboard, Vercel, segredos, IA técnica ou código é concedido.
create table if not exists public.staff_business_coowners(
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now()
);
alter table public.staff_business_coowners enable row level security;
revoke all on public.staff_business_coowners from public,anon,authenticated;
grant select on public.staff_business_coowners to authenticated;
create policy staff_business_coowners_read on public.staff_business_coowners
 for select to authenticated using ((select public.is_active_admin_or_owner()));
-- Não expor INSERT/UPDATE/DELETE desta concessão a usuários do navegador.

create or replace function public.is_business_coowner()
returns boolean language sql stable security definer set search_path='' as $fn$
 select (select auth.uid()) is not null and public.is_active_staff() and
  exists(
   select 1 from public.staff_business_coowners c
   join public.profiles p on p.id=c.profile_id
   where c.profile_id=(select auth.uid()) and p.active and p.role='admin'
  );
$fn$;
revoke all on function public.is_business_coowner() from public,anon,authenticated;
grant execute on function public.is_business_coowner() to authenticated;

-- Manutenção de usuários operacionais sem elevar ninguém a 'owner'.
-- A RPC verifica permissões reais em cada chamada e audita cada mudança.
create or replace function public.manage_business_staff_profile(
 p_target uuid,p_role text default null,p_active boolean default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid := auth.uid();v_target public.profiles%rowtype;
 v_is_owner boolean;v_is_coowner boolean;
 v_new_role text;v_new_active boolean;
begin
 v_is_owner:=public.is_active_owner();
 v_is_coowner:=public.is_business_coowner();
 if not (v_is_owner or v_is_coowner) then
  raise exception 'Sem autorização para gerenciar usuários' using errcode='42501';
 end if;
 if p_target is null or p_target=v_actor then
  raise exception 'Não é permitido alterar o próprio acesso por esta função' using errcode='42501';
 end if;
 select * into v_target from public.profiles where id=p_target for update;
 if not found or v_target.role='owner' or not exists(
    select 1 from public.staff_memberships m where m.profile_id=p_target
 ) then
  raise exception 'Usuário não pode ser alterado' using errcode='42501';
 end if;
 if v_is_coowner and exists(
   select 1 from public.staff_business_coowners c where c.profile_id=p_target
 ) then
  raise exception 'Um coproprietário não pode alterar outro coproprietário' using errcode='42501';
 end if;
 v_new_role:=coalesce(p_role,v_target.role);
 v_new_active:=coalesce(p_active,v_target.active);
 if v_new_role not in ('admin','operator') then
  raise exception 'Papel de usuário não permitido' using errcode='42501';
 end if;
 if v_target.role is distinct from v_new_role or v_target.active is distinct from v_new_active then
   update public.profiles set role=v_new_role,active=v_new_active,updated_at=now()
    where id=p_target;
   insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
    values(v_actor,'users',p_target,'operational_staff_access_changed',
     jsonb_build_object('old_role',v_target.role,'new_role',v_new_role,
      'old_active',v_target.active,'new_active',v_new_active,'scope','business_management'));
 end if;
 return true;
end;$fn$;
revoke all on function public.manage_business_staff_profile(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_business_staff_profile(uuid,text,boolean) to authenticated;

create or replace function public.set_business_agenda_manager_grant(
 p_target uuid,p_enabled boolean
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();
begin
 if not(public.is_active_owner() or public.is_business_coowner()) then
  raise exception 'Sem autorização para gerir a Agenda' using errcode='42501';
 end if;
 if p_target is null or p_enabled is null or not exists(
   select 1 from public.profiles p
   join public.staff_memberships m on m.profile_id=p.id
   where p.id=p_target and p.active and p.role='admin'
 ) then
  raise exception 'Administrador de destino inválido';
 end if;
 if not public.is_active_owner() and exists(
   select 1 from public.staff_business_coowners c where c.profile_id=p_target
 ) then
  raise exception 'Apenas o proprietário técnico pode modificar outro coproprietário' using errcode='42501';
 end if;
 insert into public.agenda_manager_grants(profile_id,can_manage,granted_by,updated_at)
 values(p_target,p_enabled,v_actor,now())
 on conflict(profile_id) do update
  set can_manage=excluded.can_manage,granted_by=excluded.granted_by,updated_at=excluded.updated_at;
 insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
 values(v_actor,'users',p_target,'operational_agenda_grant_changed',
  jsonb_build_object('enabled',p_enabled));
 return true;
end;$fn$;
revoke all on function public.set_business_agenda_manager_grant(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_business_agenda_manager_grant(uuid,boolean) to authenticated;

create or replace function public.set_business_audit_viewer_grant(
 p_target uuid,p_enabled boolean
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();
begin
 if not(public.is_active_owner() or public.is_business_coowner()) then
  raise exception 'Sem autorização para delegar leitura de auditoria' using errcode='42501';
 end if;
 if p_target is null or p_enabled is null or not exists(
  select 1 from public.profiles p join public.staff_memberships m on m.profile_id=p.id
   where p.id=p_target and p.active and p.role='operator'
 ) then
  raise exception 'Operador de destino inválido';
 end if;
 insert into public.audit_viewer_grants(profile_id,can_view,granted_by,updated_at)
 values(p_target,p_enabled,v_actor,now())
 on conflict(profile_id) do update
  set can_view=excluded.can_view,granted_by=excluded.granted_by,updated_at=excluded.updated_at;
 insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
  values(v_actor,'users',p_target,'operational_audit_view_grant_changed',
   jsonb_build_object('enabled',p_enabled));
 return true;
end;$fn$;
revoke all on function public.set_business_audit_viewer_grant(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_business_audit_viewer_grant(uuid,boolean) to authenticated;

-- Aprovação expressa do proprietário no dia 10/11/2026: Maiquiu é gestor,
-- sem receber o papel owner nem quaisquer chaves externas.
do $grant$
declare v_target uuid := '94f149c3-a2ba-4b21-b732-0184328f13e6'::uuid;
 v_owner uuid;
begin
 select id into v_owner from public.profiles where role='owner' and active limit 1;
 if v_owner is null or not exists(
  select 1 from public.profiles p join public.staff_memberships m on m.profile_id=p.id
  where p.id=v_target and p.name='Maiquiu Cardoso' and p.active and p.role='admin'
 ) then
  raise exception 'Pré-condições da autorização de coproprietário não satisfeitas';
 end if;
 insert into public.staff_business_coowners(profile_id,granted_by)
  values(v_target,v_owner) on conflict(profile_id) do nothing;
 insert into public.agenda_manager_grants(profile_id,can_manage,granted_by,updated_at)
  values(v_target,true,v_owner,now())
  on conflict(profile_id) do update
    set can_manage=true,granted_by=v_owner,updated_at=now();
 insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
  values(null,'users',v_target,'business_coowner_granted',
    jsonb_build_object('origin','approved_chat_request','designation','Coproprietário — Gestão',
    'technical_owner_unchanged',true,'access_scope','business_only'));
end;$grant$;
