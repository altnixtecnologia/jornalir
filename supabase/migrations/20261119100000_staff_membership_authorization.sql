-- Painel Jornal IR: diferenciar colaboradores convidados de contas
-- externas de assinatura/OTP. raw_user_meta_data nunca concede acesso.
create table public.staff_memberships (
 profile_id uuid primary key references public.profiles(id) on delete restrict,
 invited_by uuid references public.profiles(id) on delete restrict,
 granted_at timestamptz not null default now()
);
alter table public.staff_memberships enable row level security;
revoke all on public.staff_memberships from public,anon,authenticated;
grant select on public.staff_memberships to authenticated;

-- Recuperação de colaboradores já existentes, sem autorizar todas as contas
-- externas do Auth. Perfis owner/admin legados e convites administrativos.
insert into public.staff_memberships(profile_id)
 select p.id from public.profiles p
 join auth.users u on u.id=p.id
 where p.role in ('owner','admin')
    or (u.invited_at is not null
        and coalesce(u.raw_user_meta_data->>'account_purpose','') not in
         ('contract_signer','institutional_signer'))
on conflict(profile_id) do nothing;

create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path='' as $func$
 select exists(
  select 1 from public.staff_memberships m
  join public.profiles p on p.id=m.profile_id
  join auth.users u on u.id=p.id
  where p.id=(select auth.uid()) and p.active
    and p.role in ('owner','admin','operator')
    and u.email_confirmed_at is not null
 );
$func$;
create or replace function public.is_active_admin_or_owner()
returns boolean language sql stable security definer set search_path='' as $func$
 select exists(
  select 1 from public.staff_memberships m
  join public.profiles p on p.id=m.profile_id
  join auth.users u on u.id=p.id
  where p.id=(select auth.uid()) and p.active
    and p.role in ('owner','admin')
    and u.email_confirmed_at is not null
 );
$func$;
-- Algumas RLS antigas ainda usam is_active_admin(), em vez da função
-- mais nova: ambas exigem a mesma autorização de colaborador.
create or replace function public.is_active_admin()
returns boolean language sql stable security definer set search_path='' as $func$
 select exists(
  select 1 from public.staff_memberships m
  join public.profiles p on p.id=m.profile_id
  join auth.users u on u.id=p.id
  where p.id=(select auth.uid()) and p.active
   and p.role='admin' and u.email_confirmed_at is not null
 );
$func$;
create or replace function public.is_active_owner()
returns boolean language sql stable security definer set search_path='' as $func$
 select exists(
  select 1 from public.staff_memberships m
  join public.profiles p on p.id=m.profile_id
  join auth.users u on u.id=p.id
  where p.id=(select auth.uid()) and p.active
   and p.role='owner' and u.email_confirmed_at is not null
 );
$func$;
revoke all on function public.is_active_staff() from public,anon;
revoke all on function public.is_active_admin_or_owner() from public,anon;
revoke all on function public.is_active_admin() from public,anon;
revoke all on function public.is_active_owner() from public,anon;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.is_active_admin_or_owner() to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.is_active_owner() to authenticated;

create policy staff_memberships_read on public.staff_memberships
 for select to authenticated using(
  profile_id=(select auth.uid())
  or public.is_active_admin_or_owner()
 );
comment on table public.staff_memberships is
 'Somente colaboradores convidados por administrador: usuário de OTP/assinatura não pertence ao painel. Membership é gravada por servidor com service_role.';

-- O restante da matriz (staff_can_see_module, staff_can_finance_action,
-- staff_can_module_action) já chama is_active_staff; recebe o novo filtro
-- sem alterar os grants de operadores e sem abrir módulos.
