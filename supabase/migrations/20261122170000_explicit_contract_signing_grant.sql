-- Etapa 1 (ajuste, 08/11/2026) — concessão EXPLÍCITA para TODOS de
-- `publicidade.contratos_assinar` (assinar contratos comerciais pela
-- empresa), inclusive administrador e proprietário. PREPARADA E VERSIONADA;
-- NÃO aplicada em produção (sem autorização).
--
-- A regra geral de acesso administrativo dos demais módulos NÃO muda:
-- staff_can_module_action continua liberando owner/admin para tudo. Só este
-- poder (representação da empresa em contrato) não é presumido pelo papel.
--
--  * staff_can_sign_commercial_contracts(): verdadeiro só com linha
--    allowed=true em staff_module_action_permissions para o próprio usuário
--    ATIVO, qualquer que seja o papel (operador ainda precisa enxergar o
--    módulo Comercial).
--  * staff_signature_images (PNG) passa a depender dessa função, não mais de
--    staff_can_module_action (que libera admin/owner por papel).
--  * Quem concede: o proprietário concede/revoga para qualquer usuário
--    (inclusive admin e ele mesmo); o administrador, como já era, só para
--    operadores. A auditoria (grant/revoke, critical=true) já é feita pelo
--    trigger staff_module_action_permissions_audit (20261122140000).
--  * Admin/owner SEM concessão perdem acesso à imagem (a RLS passa a negar);
--    nenhuma imagem é apagada.

create or replace function public.staff_can_sign_commercial_contracts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.staff_module_action_permissions g
      on g.profile_id = p.id
     and g.module_key = 'publicidade'
     and g.action_key = 'contratos_assinar'
     and g.allowed
    where p.id = (select auth.uid())
      and p.active
      and (p.role in ('owner', 'admin') or public.staff_can_see_module('publicidade'))
  );
$$;

revoke all on function public.staff_can_sign_commercial_contracts() from public, anon;
grant execute on function public.staff_can_sign_commercial_contracts() to authenticated;

comment on function public.staff_can_sign_commercial_contracts() is
  'Poder de assinar contratos comerciais pela empresa: SEMPRE concessão explícita (linha allowed=true), inclusive para admin/owner. Não usa o atalho por papel de staff_can_module_action.';

drop policy if exists staff_signature_images_select_own on public.staff_signature_images;
create policy staff_signature_images_select_own on public.staff_signature_images
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    and public.staff_can_sign_commercial_contracts()
  );

-- Concessão para administrador/proprietário: só o proprietário. (Operadores
-- continuam cobertos pelas políticas existentes, para admin ou owner.)
create policy staff_module_actions_add_contract_signing on public.staff_module_action_permissions
  for insert to authenticated
  with check (
    module_key = 'publicidade'
    and action_key = 'contratos_assinar'
    and (select public.is_active_owner())
    and exists (select 1 from public.profiles p where p.id = profile_id and p.role in ('owner', 'admin'))
  );

create policy staff_module_actions_edit_contract_signing on public.staff_module_action_permissions
  for update to authenticated
  using (
    module_key = 'publicidade'
    and action_key = 'contratos_assinar'
    and (select public.is_active_owner())
    and exists (select 1 from public.profiles p where p.id = profile_id and p.role in ('owner', 'admin'))
  )
  with check (
    module_key = 'publicidade'
    and action_key = 'contratos_assinar'
    and (select public.is_active_owner())
    and exists (select 1 from public.profiles p where p.id = profile_id and p.role in ('owner', 'admin'))
  );
