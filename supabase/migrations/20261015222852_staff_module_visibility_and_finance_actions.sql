-- Permissões dos operadores do Jornal IR: visibilidade por módulo e ações financeiras.
-- Padrão para operadores: acesso negado enquanto não houver concessão explícita.
-- Proprietário e administrador têm acesso integral sem depender dessas tabelas.
create table if not exists public.staff_module_visibility (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null check (module_key in ('editorial','clientes','financeiro','assinaturas','publicidade','nfse','aniversariantes')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id,module_key)
);
create table if not exists public.staff_finance_action_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  action_key text not null check (action_key in (
    'titulos_criar','titulos_editar','titulos_cancelar','titulos_reabrir',
    'pix_gerar','pix_enviar','pix_cancelar',
    'recebimentos_baixar','recebimentos_quitar_diferenca','recebimentos_estornar',
    'ajustes_criar','ajustes_estornar','creditos_aplicar',
    'relatorios_ver','relatorios_exportar',
    'contratos_criar','contratos_editar'
  )),
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id,action_key)
);
alter table public.staff_module_visibility enable row level security;
alter table public.staff_finance_action_permissions enable row level security;
revoke all on public.staff_module_visibility,public.staff_finance_action_permissions from anon,authenticated;
grant select,insert,update on public.staff_module_visibility,public.staff_finance_action_permissions to authenticated;

drop policy if exists staff_module_visibility_select on public.staff_module_visibility;
create policy staff_module_visibility_select on public.staff_module_visibility for select to authenticated
using (profile_id=(select auth.uid()) or (select public.is_active_admin_or_owner()));
drop policy if exists staff_module_visibility_insert on public.staff_module_visibility;
create policy staff_module_visibility_insert on public.staff_module_visibility for insert to authenticated
with check ((select public.is_active_admin_or_owner()) and exists (
  select 1 from public.profiles p where p.id=profile_id and p.role='operator'
));
drop policy if exists staff_module_visibility_update on public.staff_module_visibility;
create policy staff_module_visibility_update on public.staff_module_visibility for update to authenticated
using ((select public.is_active_admin_or_owner()) and exists(
  select 1 from public.profiles p where p.id=profile_id and p.role='operator'
))
with check ((select public.is_active_admin_or_owner()) and exists(
  select 1 from public.profiles p where p.id=profile_id and p.role='operator'
));

drop policy if exists staff_finance_actions_select on public.staff_finance_action_permissions;
create policy staff_finance_actions_select on public.staff_finance_action_permissions for select to authenticated
using (profile_id=(select auth.uid()) or (select public.is_active_admin_or_owner()));
drop policy if exists staff_finance_actions_insert on public.staff_finance_action_permissions;
create policy staff_finance_actions_insert on public.staff_finance_action_permissions for insert to authenticated
with check ((select public.is_active_admin_or_owner()) and exists(
  select 1 from public.profiles p where p.id=profile_id and p.role='operator'
));
drop policy if exists staff_finance_actions_update on public.staff_finance_action_permissions;
create policy staff_finance_actions_update on public.staff_finance_action_permissions for update to authenticated
using ((select public.is_active_admin_or_owner()) and exists(
  select 1 from public.profiles p where p.id=profile_id and p.role='operator'
))
with check ((select public.is_active_admin_or_owner()) and exists(
  select 1 from public.profiles p where p.id=profile_id and p.role='operator'
));

create or replace function public.staff_can_see_module(p_module text)
returns boolean language sql stable security definer set search_path=''
as $func$
  select exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.active
    and (
      p.role in ('owner','admin')
      or (p.role='operator' and
        case when p_module in ('agenda','pauta')
          then public.has_staff_module_access(p_module,false)
          else exists(select 1 from public.staff_module_visibility m
            where m.profile_id=p.id and m.module_key=p_module and m.enabled)
        end
      )
    )
  );
$func$;
revoke all on function public.staff_can_see_module(text) from public,anon;
grant execute on function public.staff_can_see_module(text) to authenticated;

create or replace function public.staff_can_finance_action(p_action text)
returns boolean language sql stable security definer set search_path=''
as $func$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active
      and (p.role in ('owner','admin')
        or (p.role='operator' and
          public.staff_can_see_module('financeiro')
          and exists(select 1 from public.staff_finance_action_permissions f
          where f.profile_id=p.id and f.action_key=p_action and f.allowed)))
  );
$func$;
revoke all on function public.staff_can_finance_action(text) from public,anon;
grant execute on function public.staff_can_finance_action(text) to authenticated;
