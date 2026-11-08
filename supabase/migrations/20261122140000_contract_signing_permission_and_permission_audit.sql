-- Etapa 1 — Contratos/Assinador (08/11/2026). PREPARADA E VERSIONADA; NÃO
-- aplicada em produção nesta etapa (sem autorização).
--
-- 1) Nova ação granular `publicidade.contratos_assinar` ("Assinar contratos
--    comerciais"): poder individual, nunca presumido, sem isDefault. A CHECK
--    fechada `staff_module_actions_known_pair` é recriada com TODAS as ações
--    do catálogo TS (staffPermissionsCatalog.ts) — inclui também
--    `assinaturas.assinaturas_ativar` e `publicidade.solicitacoes_gerenciar`,
--    que já existiam no catálogo mas faltavam na CHECK de produção (conceder
--    qualquer uma a um operador falhava e derrubava o upsert do grupo todo).
--    Teste de paridade catálogo × CHECK: test/staff-permissions-catalog-parity.test.ts.
-- 2) Auditoria atômica (trigger) de concessão/revogação de qualquer ação
--    granular — antes a edição de permissões era feita direto do navegador,
--    sem nenhum registro.

alter table public.staff_module_action_permissions
  drop constraint if exists staff_module_actions_known_pair;

alter table public.staff_module_action_permissions
  add constraint staff_module_actions_known_pair check (
    (module_key = 'editorial' and action_key in ('materias_criar', 'materias_editar', 'materias_publicar', 'materias_arquivar', 'midias_gerenciar', 'edicoes_gerenciar'))
    or (module_key = 'clientes' and action_key in ('clientes_criar', 'clientes_editar'))
    or (module_key = 'assinaturas' and action_key in ('assinaturas_criar', 'assinaturas_editar', 'assinaturas_ativar', 'assinaturas_suspender', 'assinaturas_cancelar'))
    or (module_key = 'publicidade' and action_key in ('produtos_gerenciar', 'solicitacoes_gerenciar', 'propostas_criar', 'propostas_editar', 'propostas_aprovar', 'vendas_criar', 'vendas_editar', 'vendas_cancelar', 'locacao_equipamentos_gerenciar', 'locacao_reservas_gerenciar', 'locacao_vistorias_registrar', 'contratos_preparar', 'contratos_revisar', 'contratos_assinar'))
    or (module_key = 'nfse' and action_key in ('rascunhos_criar', 'rascunhos_editar', 'notas_emitir', 'notas_cancelar', 'configuracoes_gerenciar', 'perfis_servico_gerenciar'))
    or (module_key = 'aniversariantes' and action_key in ('aniversariantes_gerenciar', 'mensagens_gerenciar'))
  );

-- Auditoria de concessão/revogação. SECURITY DEFINER para gravar em
-- audit_events mesmo sob a RLS do usuário; só registra mudança real do
-- valor de `allowed` (um upsert idempotente sem mudança não gera evento).
create or replace function public.audit_staff_module_permission_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous boolean;
  v_next boolean := new.allowed;
begin
  if tg_op = 'UPDATE' then
    v_previous := old.allowed;
    if v_previous is not distinct from v_next then
      return new;
    end if;
  else
    v_previous := false;
    if v_next is not true then
      return new;
    end if;
  end if;

  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (
    auth.uid(),
    'staff_permission',
    new.profile_id,
    case when v_next then 'grant' else 'revoke' end,
    jsonb_build_object(
      'module_key', new.module_key,
      'action_key', new.action_key,
      'allowed', v_next,
      'previous_allowed', v_previous,
      'critical', (new.module_key = 'publicidade' and new.action_key = 'contratos_assinar')
    )
  );
  return new;
end;
$$;

revoke all on function public.audit_staff_module_permission_change() from public, anon, authenticated;

drop trigger if exists staff_module_action_permissions_audit on public.staff_module_action_permissions;
create trigger staff_module_action_permissions_audit
  after insert or update on public.staff_module_action_permissions
  for each row
  execute function public.audit_staff_module_permission_change();

comment on function public.audit_staff_module_permission_change() is
  'Registra em audit_events (entity_type=staff_permission, action=grant|revoke) toda mudança real de uma ação granular de operador, atômico com a alteração. `critical=true` marca o poder de assinar contratos comerciais.';
