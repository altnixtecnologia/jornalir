-- Preparada 17/11/2026; aplicada no Supabase em 17/11/2026 sob versao 20261117171920.
-- Modulo Configuracoes com direito pontual a patrocinadores, sem Comercial/vendas.
-- Sem UPDATE/DELETE em conteudo, imagens ou usuarios. Preserva owner/admin.
BEGIN;

ALTER TABLE public.staff_module_visibility
  DROP CONSTRAINT staff_module_visibility_module_key_check;
ALTER TABLE public.staff_module_visibility
  ADD CONSTRAINT staff_module_visibility_module_key_check CHECK (
    module_key IN ('editorial','clientes','financeiro','assinaturas',
      'publicidade','configuracoes','nfse','aniversariantes')
  );

ALTER TABLE public.staff_module_action_permissions
  DROP CONSTRAINT staff_module_actions_known_pair;
ALTER TABLE public.staff_module_action_permissions
  ADD CONSTRAINT staff_module_actions_known_pair CHECK (
    (module_key = 'editorial' AND action_key IN
      ('materias_criar','materias_editar','materias_publicar','materias_arquivar','midias_gerenciar','edicoes_gerenciar'))
    OR (module_key = 'clientes' AND action_key IN ('clientes_criar','clientes_editar'))
    OR (module_key = 'assinaturas' AND action_key IN
      ('assinaturas_criar','assinaturas_editar','assinaturas_ativar','assinaturas_suspender','assinaturas_cancelar'))
    OR (module_key = 'publicidade' AND action_key IN
      ('produtos_gerenciar','solicitacoes_gerenciar','propostas_criar','propostas_editar',
       'propostas_aprovar','vendas_criar','vendas_editar','vendas_cancelar',
       'locacao_equipamentos_gerenciar','locacao_reservas_gerenciar','locacao_vistorias_registrar',
       'contratos_preparar','contratos_revisar','contratos_assinar','valores_negociar'))
    OR (module_key = 'configuracoes' AND action_key IN ('patrocinadores_gerenciar','valores_assine_gerenciar'))
    OR (module_key = 'nfse' AND action_key IN
      ('rascunhos_criar','rascunhos_editar','notas_emitir','notas_cancelar',
       'documentos_consultar','documentos_enviar','configuracoes_gerenciar','perfis_servico_gerenciar'))
    OR (module_key = 'aniversariantes' AND action_key IN
      ('aniversariantes_gerenciar','mensagens_gerenciar'))
  );

ALTER POLICY media_assets_select_staff ON public.media_assets
  USING (public.is_active_staff() AND (
    public.staff_can_see_module('editorial')
    OR public.staff_can_see_module('publicidade')
    OR public.staff_can_module_action('configuracoes','patrocinadores_gerenciar')
    OR public.staff_can_see_module('aniversariantes')
  ));
ALTER POLICY media_assets_insert_staff ON public.media_assets
  WITH CHECK (public.is_active_staff() AND (
    public.staff_can_module_action('editorial','midias_gerenciar')
    OR public.staff_can_module_action('editorial','materias_criar')
    OR public.staff_can_module_action('aniversariantes','aniversariantes_gerenciar')
    OR public.staff_can_module_action('configuracoes','patrocinadores_gerenciar')
  ));

ALTER POLICY site_ad_media_insert_staff ON public.site_ad_media
  WITH CHECK (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'));
ALTER POLICY site_ad_media_update_staff ON public.site_ad_media
  USING (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'))
  WITH CHECK (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'));
ALTER POLICY site_ad_media_delete_staff ON public.site_ad_media
  USING (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'));

ALTER POLICY site_ad_slots_update_staff ON public.site_ad_slots
  USING (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'))
  WITH CHECK (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'));

-- Antes qualquer funcionario ativo podia editar configuracao global.
ALTER POLICY site_ad_settings_insert_staff ON public.site_ad_settings
  WITH CHECK (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'));
ALTER POLICY site_ad_settings_update_staff ON public.site_ad_settings
  USING (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'))
  WITH CHECK (public.is_active_staff() AND public.staff_can_module_action('configuracoes','patrocinadores_gerenciar'));

-- Preços, descontos e visibilidade do Assine podem afetar receitas:
-- acesso apenas com concessão individual confirmada pelo administrador.
-- A política anterior permitia UPDATE a qualquer funcionário ativo.
ALTER POLICY site_offer_settings_staff_update ON public.site_offer_settings
  USING (public.is_active_staff() AND public.staff_can_module_action('configuracoes','valores_assine_gerenciar'))
  WITH CHECK (public.is_active_staff() AND public.staff_can_module_action('configuracoes','valores_assine_gerenciar'));

COMMIT;
