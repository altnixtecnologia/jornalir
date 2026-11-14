-- NFS-e: permissões separadas para CONSULTAR documentos fiscais e ENVIAR/REENCAMINHAR (hoje ambos usam notas_cancelar).
-- NAO aplicada no Supabase oficial. Só amplia a lista de ações conhecidas (owner/admin já passam por staff_can_module_action;
-- as duas ações são "somente administração" no catálogo, então nenhuma permissão é concedida a operadores por esta migration).
-- Reversão: recriar a CHECK sem documentos_consultar/documentos_enviar (nenhuma linha usa as chaves enquanto não forem concedidas).
-- Catálogo de ações: CHECK recriada com TODAS as ações vigentes + as duas novas de NFS-e.
alter table public.staff_module_action_permissions
  drop constraint if exists staff_module_actions_known_pair;

alter table public.staff_module_action_permissions
  add constraint staff_module_actions_known_pair check (
    (module_key = 'editorial' and action_key in ('materias_criar', 'materias_editar', 'materias_publicar', 'materias_arquivar', 'midias_gerenciar', 'edicoes_gerenciar'))
    or (module_key = 'clientes' and action_key in ('clientes_criar', 'clientes_editar'))
    or (module_key = 'assinaturas' and action_key in ('assinaturas_criar', 'assinaturas_editar', 'assinaturas_ativar', 'assinaturas_suspender', 'assinaturas_cancelar'))
    or (module_key = 'publicidade' and action_key in ('produtos_gerenciar', 'solicitacoes_gerenciar', 'propostas_criar', 'propostas_editar', 'propostas_aprovar', 'vendas_criar', 'vendas_editar', 'vendas_cancelar', 'locacao_equipamentos_gerenciar', 'locacao_reservas_gerenciar', 'locacao_vistorias_registrar', 'contratos_preparar', 'contratos_revisar', 'contratos_assinar', 'valores_negociar'))
    or (module_key = 'nfse' and action_key in ('rascunhos_criar', 'rascunhos_editar', 'notas_emitir', 'notas_cancelar', 'documentos_consultar', 'documentos_enviar', 'configuracoes_gerenciar', 'perfis_servico_gerenciar'))
    or (module_key = 'aniversariantes' and action_key in ('aniversariantes_gerenciar', 'mensagens_gerenciar'))
  );
