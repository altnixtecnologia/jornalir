-- RECONSTRUÍDA em 17/10/2026 (preparação de publicação): esta migration
-- não existia em NENHUM arquivo local, mas as tabelas/funções abaixo já
-- existem no banco remoto (confirmado via `supabase db dump --schema
-- public`, leitura apenas) e são usadas por várias partes do código
-- (staff_can_see_module é chamada por módulos como Publicidade/
-- Aniversariantes/NFS-e para liberar acesso granular por módulo, e
-- staff_can_finance_action pelas ações financeiras granulares). Sem este
-- arquivo, um fresh install (`supabase start` do zero) falha em qualquer
-- migration posterior que chame staff_can_see_module — foi exatamente
-- assim que esta lacuna foi descoberta. Conteúdo abaixo é uma
-- reconstrução FIEL do schema já aplicado (via pg_dump), não uma
-- funcionalidade nova. Nenhuma alteração de comportamento.

create table if not exists public.staff_module_visibility (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  module_key text not null check (module_key in (
    'editorial', 'clientes', 'financeiro', 'assinaturas', 'publicidade', 'nfse', 'aniversariantes'
  )),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint staff_module_visibility_pkey primary key (profile_id, module_key)
);

alter table public.staff_module_visibility enable row level security;

drop policy if exists staff_module_visibility_select on public.staff_module_visibility;
create policy staff_module_visibility_select
  on public.staff_module_visibility for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_active_admin_or_owner()));

drop policy if exists staff_module_visibility_insert on public.staff_module_visibility;
create policy staff_module_visibility_insert
  on public.staff_module_visibility for insert to authenticated
  with check (
    (select public.is_active_admin_or_owner())
    and exists (select 1 from public.profiles p where p.id = staff_module_visibility.profile_id and p.role = 'operator')
  );

drop policy if exists staff_module_visibility_update on public.staff_module_visibility;
create policy staff_module_visibility_update
  on public.staff_module_visibility for update to authenticated
  using (
    (select public.is_active_admin_or_owner())
    and exists (select 1 from public.profiles p where p.id = staff_module_visibility.profile_id and p.role = 'operator')
  )
  with check (
    (select public.is_active_admin_or_owner())
    and exists (select 1 from public.profiles p where p.id = staff_module_visibility.profile_id and p.role = 'operator')
  );

grant select, insert, update on table public.staff_module_visibility to authenticated;

create table if not exists public.staff_finance_action_permissions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action_key text not null check (action_key in (
    'titulos_criar', 'titulos_editar', 'titulos_cancelar', 'titulos_reabrir',
    'pix_gerar', 'pix_enviar', 'pix_cancelar',
    'recebimentos_baixar', 'recebimentos_quitar_diferenca', 'recebimentos_estornar',
    'ajustes_criar', 'ajustes_estornar', 'creditos_aplicar',
    'relatorios_ver', 'relatorios_exportar',
    'contratos_criar', 'contratos_editar'
  )),
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint staff_finance_action_permissions_pkey primary key (profile_id, action_key)
);

alter table public.staff_finance_action_permissions enable row level security;

drop policy if exists staff_finance_actions_select on public.staff_finance_action_permissions;
create policy staff_finance_actions_select
  on public.staff_finance_action_permissions for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_active_admin_or_owner()));

drop policy if exists staff_finance_actions_insert on public.staff_finance_action_permissions;
create policy staff_finance_actions_insert
  on public.staff_finance_action_permissions for insert to authenticated
  with check (
    (select public.is_active_admin_or_owner())
    and exists (select 1 from public.profiles p where p.id = staff_finance_action_permissions.profile_id and p.role = 'operator')
  );

drop policy if exists staff_finance_actions_update on public.staff_finance_action_permissions;
create policy staff_finance_actions_update
  on public.staff_finance_action_permissions for update to authenticated
  using (
    (select public.is_active_admin_or_owner())
    and exists (select 1 from public.profiles p where p.id = staff_finance_action_permissions.profile_id and p.role = 'operator')
  )
  with check (
    (select public.is_active_admin_or_owner())
    and exists (select 1 from public.profiles p where p.id = staff_finance_action_permissions.profile_id and p.role = 'operator')
  );

grant select, insert, update on table public.staff_finance_action_permissions to authenticated;

create or replace function public.staff_can_see_module(p_module text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.active
    and (
      p.role in ('owner', 'admin')
      or (p.role = 'operator' and
        case when p_module in ('agenda', 'pauta')
          then public.has_staff_module_access(p_module, false)
          else exists(select 1 from public.staff_module_visibility m
            where m.profile_id = p.id and m.module_key = p_module and m.enabled)
        end
      )
    )
  );
$$;

comment on function public.staff_can_see_module(text) is
  'True quando o profile ativo pode ver o módulo informado — owner/admin sempre; operator conforme staff_module_visibility (ou has_staff_module_access para agenda/pauta, que usa sua própria tabela granular).';

create or replace function public.staff_can_finance_action(p_action text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
      and (p.role in ('owner', 'admin')
        or (p.role = 'operator' and
          public.staff_can_see_module('financeiro')
          and exists(select 1 from public.staff_finance_action_permissions f
          where f.profile_id = p.id and f.action_key = p_action and f.allowed)))
  );
$$;

comment on function public.staff_can_finance_action(text) is
  'True quando o profile ativo pode executar a ação financeira granular informada — owner/admin sempre; operator precisa de staff_can_see_module(financeiro) E da permissão granular específica em staff_finance_action_permissions.';
