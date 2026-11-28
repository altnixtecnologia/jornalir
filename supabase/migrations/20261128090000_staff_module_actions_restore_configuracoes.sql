-- Restaura o módulo `configuracoes` na CHECK staff_module_actions_known_pair.
--
-- Contexto: 20261117171920_sponsor_operator_permissions.sql incluiu
--   (module_key='configuracoes' and action_key in ('patrocinadores_gerenciar','valores_assine_gerenciar'))
-- e as migrations 20261122140000, 20261122190000 e 20261122340800 recriaram a CHECK SEM esse módulo, o que impede
-- conceder essas duas ações a operadores (admin/owner continuam passando pelo papel).
--
-- Esta migration é ADITIVA e posterior a todas: recria a CHECK com TODAS as ações do catálogo vigente
-- (apps/sistema/src/lib/permissions/staffPermissionsCatalog.ts), inclusive documentos_consultar/documentos_enviar da
-- NFS-e. Por isso funciona tanto se 20261122340800 já tiver sido aplicada quanto se ainda não tiver (a 340800 não é
-- editada: não foi possível provar localmente o estado do ledger de produção).
--
-- NÃO concede permissão a ninguém, não altera RLS, funções, políticas nem linhas existentes.
-- Segurança de execução: a CHECK entra NOT VALID (vale para novas escritas sem varrer a tabela nem falhar por linhas
-- anteriores) e é validada em seguida; se alguma linha antiga violar, a validação apenas emite WARNING e a CHECK segue
-- aplicada para novas escritas (investigar com a consulta de verificação do manifesto de migrations).
-- Reversão: recriar a CHECK da 20261122340800 (perde configuracoes para novas concessões; não remove linhas).

alter table public.staff_module_action_permissions
  drop constraint if exists staff_module_actions_known_pair;

alter table public.staff_module_action_permissions
  add constraint staff_module_actions_known_pair check (
    (module_key = 'editorial' and action_key in ('materias_criar', 'materias_editar', 'materias_publicar', 'materias_arquivar', 'midias_gerenciar', 'edicoes_gerenciar'))
    or (module_key = 'clientes' and action_key in ('clientes_criar', 'clientes_editar'))
    or (module_key = 'assinaturas' and action_key in ('assinaturas_criar', 'assinaturas_editar', 'assinaturas_ativar', 'assinaturas_suspender', 'assinaturas_cancelar'))
    or (module_key = 'configuracoes' and action_key in ('patrocinadores_gerenciar', 'valores_assine_gerenciar'))
    or (module_key = 'publicidade' and action_key in ('produtos_gerenciar', 'solicitacoes_gerenciar', 'propostas_criar', 'propostas_editar', 'propostas_aprovar', 'vendas_criar', 'vendas_editar', 'vendas_cancelar', 'locacao_equipamentos_gerenciar', 'locacao_reservas_gerenciar', 'locacao_vistorias_registrar', 'contratos_preparar', 'contratos_revisar', 'contratos_assinar', 'valores_negociar'))
    or (module_key = 'nfse' and action_key in ('rascunhos_criar', 'rascunhos_editar', 'notas_emitir', 'notas_cancelar', 'documentos_consultar', 'documentos_enviar', 'perfis_servico_gerenciar', 'configuracoes_gerenciar'))
    or (module_key = 'aniversariantes' and action_key in ('aniversariantes_gerenciar', 'mensagens_gerenciar'))
  ) not valid;

do $validate$
begin
  alter table public.staff_module_action_permissions validate constraint staff_module_actions_known_pair;
exception when check_violation then
  raise warning 'staff_module_actions_known_pair permanece NOT VALID: existem linhas antigas fora do catálogo; revisar antes de validar.';
end;
$validate$;
