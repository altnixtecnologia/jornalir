-- Convites do Supabase Auth: um perfil active=true criado pelo trigger
-- não pode autenticar ações do Jornal IR antes de confirmar o e-mail.
-- Esta migration complementa a UI de "Convite pendente".
-- Não altera nem ativa/desativa os perfis existentes.
create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles p
    join auth.users u on u.id=p.id
    where p.id=(select auth.uid()) and p.active
      and p.role in ('owner','admin','operator')
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_active_admin_or_owner()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles p
    join auth.users u on u.id=p.id
    where p.id=(select auth.uid()) and p.active
      and p.role in ('owner','admin')
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_agenda_manager()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and public.is_active_staff()
      and (p.role='owner' or
        (p.role='admin' and exists(
          select 1 from public.agenda_manager_grants g
          where g.profile_id=p.id and g.can_manage
        )))
  );
$$;

create or replace function public.staff_can_see_module(p_module text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and public.is_active_staff()
      and (p.role in ('owner','admin')
        or (p.role='operator' and
          case when p_module in ('agenda','pauta')
            then public.has_staff_module_access(p_module,false)
            else exists(
              select 1 from public.staff_module_visibility m
              where m.profile_id=p.id and m.module_key=p_module and m.enabled
            )
          end))
  );
$$;

create or replace function public.staff_can_finance_action(p_action text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and public.is_active_staff()
      and (p.role in ('owner','admin')
        or (p.role='operator' and public.staff_can_see_module('financeiro')
          and exists(
            select 1 from public.staff_finance_action_permissions f
            where f.profile_id=p.id and f.action_key=p_action and f.allowed
          )))
  );
$$;

-- A função introduzida em 20261102100000 também recebe a mesma proteção.
create or replace function public.staff_can_module_action(p_module text,p_action text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and public.is_active_staff()
      and (p.role in ('owner','admin')
        or (p.role='operator' and public.staff_can_see_module(p_module)
          and exists(
            select 1 from public.staff_module_action_permissions a
            where a.profile_id=p.id and a.module_key=p_module
              and a.action_key=p_action and a.allowed
          )))
  );
$$;

-- Chamadas autenticadas somente (não reabrir para PUBLIC/anon).
revoke all on function public.is_active_staff() from public,anon;
revoke all on function public.is_active_admin_or_owner() from public,anon;
revoke all on function public.is_agenda_manager() from public,anon;
revoke all on function public.staff_can_see_module(text) from public,anon;
revoke all on function public.staff_can_finance_action(text) from public,anon;
revoke all on function public.staff_can_module_action(text,text) from public,anon;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.is_active_admin_or_owner() to authenticated;
grant execute on function public.is_agenda_manager() to authenticated;
grant execute on function public.staff_can_see_module(text) to authenticated;
grant execute on function public.staff_can_finance_action(text) to authenticated;
grant execute on function public.staff_can_module_action(text,text) to authenticated;
