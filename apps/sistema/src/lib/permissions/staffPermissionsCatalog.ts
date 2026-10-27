/** Catálogo de permissões disponíveis aos operadores.
 * Administradores e proprietário possuem acesso integral independentemente das tabelas.
 * Ações financeiras granulares são uma revisão separada.
 */
export const STAFF_MODULES = [
  { key: "editorial", label: "Editorial / Matérias" },
  { key: "clientes", label: "Cadastros / Clientes" },
  { key: "financeiro", label: "Financeiro" },
  { key: "assinaturas", label: "Assinaturas" },
  { key: "publicidade", label: "Comercial" },
  { key: "nfse", label: "NFS-e", releaseBlocked: true },
  { key: "aniversariantes", label: "Aniversariantes" },
] as const;
export type StaffModuleKey = (typeof STAFF_MODULES)[number]["key"];

/** Módulos elegíveis para o comando "Ativar módulos (padrão)".
 * NFS-e permanece de fora enquanto a política de release a mantiver bloqueada. */
export const STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION: readonly StaffModuleKey[] =
  STAFF_MODULES.filter((item) => !("releaseBlocked" in item && item.releaseBlocked)).map((item) => item.key);


/** Chaves reais da tabela staff_finance_action_permissions.
 * `isDefault`: entra na seleção automática ao ativar o módulo Financeiro por
 * um operador pela primeira vez — nunca marcado em baixas, estornos,
 * cancelamentos, reaberturas, quitação com diferença ou ajustes sensíveis.
 * `isCritical`: ao usar "Selecionar tudo", exige confirmação explícita antes
 * de incluir a ação (estornar recebimento, cancelar cobrança Pix). */
export const STAFF_FINANCE_ACTIONS = [
  { key: "titulos_criar", label: "Criar títulos", group: "Contas a receber", isDefault: true },
  { key: "titulos_editar", label: "Editar títulos", group: "Contas a receber", isDefault: true },
  { key: "titulos_cancelar", label: "Cancelar títulos", group: "Contas a receber" },
  { key: "titulos_reabrir", label: "Reabrir títulos", group: "Contas a receber" },
  { key: "recebimentos_baixar", label: "Registrar recebimento (dar baixa)", group: "Recebimentos" },
  { key: "recebimentos_quitar_diferenca", label: "Quitar com diferença", group: "Recebimentos" },
  { key: "recebimentos_estornar", label: "Estornar recebimento", group: "Recebimentos", isCritical: true },
  { key: "pix_gerar", label: "Gerar cobrança Pix", group: "Pix", isDefault: true },
  { key: "pix_enviar", label: "Enviar cobrança ao cliente", group: "Pix", isDefault: true },
  { key: "pix_cancelar", label: "Cancelar cobrança Pix", group: "Pix", isCritical: true },
  { key: "ajustes_criar", label: "Criar ajuste/desconto", group: "Ajustes e créditos" },
  { key: "ajustes_estornar", label: "Estornar ajuste", group: "Ajustes e créditos" },
  { key: "creditos_aplicar", label: "Aplicar crédito", group: "Ajustes e créditos" },
  { key: "contratos_criar", label: "Criar contratos", group: "Contratos", isDefault: true },
  { key: "contratos_editar", label: "Editar contratos e anexos", group: "Contratos", isDefault: true },
  { key: "relatorios_ver", label: "Consultar relatórios", group: "Relatórios", isDefault: true },
  { key: "relatorios_exportar", label: "Exportar relatórios", group: "Relatórios", isDefault: true },
] as const;
export type StaffFinanceActionKey = (typeof STAFF_FINANCE_ACTIONS)[number]["key"];


/** Acesso/visualização é definido por staff_module_visibility.
 * As ações abaixo são permissões extras e independentes; nenhuma é presumida.
 * Agenda/Pauta mantêm a matriz existente de leitura, responsável e gestão.
 *
 * `isDefault`: entra na seleção automática ao um operador ter o módulo
 * ativado pela primeira vez — nunca em ações `adminOnly` nem em operações
 * que alterem irreversivelmente um compromisso já firmado (cancelamentos,
 * suspensões, aprovações de proposta, configurações de locação/jurídico).
 * `isCritical`: ao usar "Selecionar tudo", exige confirmação explícita antes
 * de incluir a ação (cancelar vendas, cancelar assinaturas).
 */
export const STAFF_MODULE_ACTIONS = [
  { module: "editorial", key: "materias_criar", label: "Criar matérias", isDefault: true },
  { module: "editorial", key: "materias_editar", label: "Editar matérias", isDefault: true },
  { module: "editorial", key: "materias_publicar", label: "Publicar e agendar matérias", isDefault: true },
  { module: "editorial", key: "materias_arquivar", label: "Arquivar matérias" },
  { module: "editorial", key: "midias_gerenciar", label: "Gerenciar mídias", isDefault: true },
  { module: "editorial", key: "edicoes_gerenciar", label: "Gerenciar edições, editorias e destaques" },
  { module: "clientes", key: "clientes_criar", label: "Cadastrar clientes", isDefault: true },
  { module: "clientes", key: "clientes_editar", label: "Editar clientes", isDefault: true },
  { module: "assinaturas", key: "assinaturas_criar", label: "Contratar assinaturas", isDefault: true },
  { module: "assinaturas", key: "assinaturas_editar", label: "Alterar assinaturas", isDefault: true },
  { module: "assinaturas", key: "assinaturas_suspender", label: "Suspender ou reativar assinaturas" },
  { module: "assinaturas", key: "assinaturas_cancelar", label: "Cancelar assinaturas", isCritical: true },
  { module: "publicidade", key: "produtos_gerenciar", label: "Criar e editar produtos/planos" },
  { module: "publicidade", key: "propostas_criar", label: "Criar propostas", isDefault: true },
  { module: "publicidade", key: "propostas_editar", label: "Editar propostas", isDefault: true },
  { module: "publicidade", key: "propostas_aprovar", label: "Aprovar propostas e converter em vendas" },
  { module: "publicidade", key: "vendas_criar", label: "Criar vendas", isDefault: true },
  { module: "publicidade", key: "vendas_editar", label: "Editar vendas", isDefault: true },
  { module: "publicidade", key: "vendas_cancelar", label: "Cancelar vendas", isCritical: true },
  { module: "publicidade", key: "locacao_equipamentos_gerenciar", label: "Cadastrar e manter equipamentos para locação" },
  { module: "publicidade", key: "locacao_reservas_gerenciar", label: "Criar e acompanhar reservas de locação", isDefault: true },
  { module: "publicidade", key: "locacao_vistorias_registrar", label: "Registrar vistorias de entrega/devolução", isDefault: true },
  { module: "publicidade", key: "contratos_preparar", label: "Preparar documentos comerciais e seus prazos", isDefault: true },
  { module: "publicidade", key: "contratos_revisar", label: "Encaminhar contratos para revisão jurídica" },
  { module: "nfse", key: "rascunhos_criar", label: "Criar rascunhos fiscais", isDefault: true },
  { module: "nfse", key: "rascunhos_editar", label: "Editar rascunhos fiscais", isDefault: true },
  { module: "nfse", key: "notas_emitir", label: "Emitir NFS-e (somente administração)", adminOnly: true },
  { module: "nfse", key: "notas_cancelar", label: "Cancelar NFS-e (somente administração)", adminOnly: true },
  { module: "nfse", key: "perfis_servico_gerenciar", label: "Gerenciar perfis de serviço" },
  { module: "nfse", key: "configuracoes_gerenciar", label: "Configurações do emissor e certificado (somente administração)", adminOnly: true },
  { module: "aniversariantes", key: "aniversariantes_gerenciar", label: "Cadastrar, editar e retirar aniversariantes", isDefault: true },
  { module: "aniversariantes", key: "mensagens_gerenciar", label: "Gerenciar mensagens e modelos", isDefault: true },
] as const;

export type StaffModuleAction = (typeof STAFF_MODULE_ACTIONS)[number];
export type StaffModuleActionKey = StaffModuleAction["key"];
export type StaffActionModule = StaffModuleAction["module"];
