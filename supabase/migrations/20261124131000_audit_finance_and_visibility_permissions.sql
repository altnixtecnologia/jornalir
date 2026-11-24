-- Auditoria transacional incremental para os dois tipos de permissões ainda sem trigger
-- em 24/11/2026: financeiro e visibilidade do módulo.
-- Reaproveita public.audit_events e NÃO altera trigger já existente
-- de staff_module_action_permissions (20261122140000).
-- Sem alterações retroativas nos grants ou no histórico.
begin;

create or replace function public.audit_staff_finance_or_visibility_permission_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prior boolean;
  v_next boolean;
  v_module text;
  v_action text;
  v_critical boolean := false;
begin
  if tg_table_schema <> 'public' or tg_table_name not in (
    'staff_finance_action_permissions', 'staff_module_visibility'
  ) then
    raise exception 'Tabela não permitida para auditoria de permissões.';
  end if;

  if tg_table_name = 'staff_finance_action_permissions' then
    v_next := new.allowed;
    v_prior := case when tg_op = 'UPDATE' then old.allowed else false end;
    v_module := 'financeiro';
    v_action := new.action_key;
    v_critical := new.action_key in ('recebimentos_estornar', 'pix_cancelar');
  else
    v_next := new.enabled;
    v_prior := case when tg_op = 'UPDATE' then old.enabled else false end;
    v_module := new.module_key;
    v_action := 'visibilidade_modulo';
  end if;

  if v_prior is not distinct from v_next then
    return new;
  end if;

  insert into public.audit_events (
    user_id, entity_type, entity_id, action, metadata
  ) values (
    auth.uid(),
    'staff_permission',
    new.profile_id,
    case when v_next then 'grant' else 'revoke' end,
    jsonb_build_object(
      'module_key', v_module,
      'action_key', v_action,
      'allowed', v_next,
      'previous_allowed', v_prior,
      'critical', v_critical,
      'origin', 'trigger:staff_permission',
      'actor_type', case when auth.uid() is null then 'service' else 'authenticated_staff' end
    )
  );
  return new;
end;
$$;

revoke all on function public.audit_staff_finance_or_visibility_permission_change()
  from public, anon, authenticated;

drop trigger if exists staff_finance_action_permissions_audit
  on public.staff_finance_action_permissions;
create trigger staff_finance_action_permissions_audit
  after insert or update of allowed on public.staff_finance_action_permissions
  for each row
  execute function public.audit_staff_finance_or_visibility_permission_change();

drop trigger if exists staff_module_visibility_audit
  on public.staff_module_visibility;
create trigger staff_module_visibility_audit
  after insert or update of enabled on public.staff_module_visibility
  for each row
  execute function public.audit_staff_finance_or_visibility_permission_change();

comment on function public.audit_staff_finance_or_visibility_permission_change() is
  'Audita concessão e revogação real de permissões financeiras e visibilidade, no mesmo commit e com ator autenticado quando disponível. Não replica gravação idempotente.';
commit;
