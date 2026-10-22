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
  { key: "nfse", label: "NFS-e" },
  { key: "aniversariantes", label: "Aniversariantes" },
] as const;
export type StaffModuleKey = (typeof STAFF_MODULES)[number]["key"];


/** Chaves reais da tabela staff_finance_action_permissions. */
export const STAFF_FINANCE_ACTIONS = [
  { key: "titulos_criar", label: "Criar títulos", group: "Contas a receber" },
  { key: "titulos_editar", label: "Editar títulos", group: "Contas a receber" },
  { key: "titulos_cancelar", label: "Cancelar títulos", group: "Contas a receber" },
  { key: "titulos_reabrir", label: "Reabrir títulos", group: "Contas a receber" },
  { key: "recebimentos_baixar", label: "Registrar recebimento (dar baixa)", group: "Recebimentos" },
  { key: "recebimentos_quitar_diferenca", label: "Quitar com diferença", group: "Recebimentos" },
  { key: "recebimentos_estornar", label: "Estornar recebimento", group: "Recebimentos" },
  { key: "pix_gerar", label: "Gerar cobrança Pix", group: "Pix" },
  { key: "pix_enviar", label: "Enviar cobrança ao cliente", group: "Pix" },
  { key: "pix_cancelar", label: "Cancelar cobrança Pix", group: "Pix" },
  { key: "ajustes_criar", label: "Criar ajuste/desconto", group: "Ajustes e créditos" },
  { key: "ajustes_estornar", label: "Estornar ajuste", group: "Ajustes e créditos" },
  { key: "creditos_aplicar", label: "Aplicar crédito", group: "Ajustes e créditos" },
  { key: "contratos_criar", label: "Criar contratos", group: "Contratos" },
  { key: "contratos_editar", label: "Editar contratos e anexos", group: "Contratos" },
  { key: "relatorios_ver", label: "Consultar relatórios", group: "Relatórios" },
  { key: "relatorios_exportar", label: "Exportar relatórios", group: "Relatórios" },
] as const;
export type StaffFinanceActionKey = (typeof STAFF_FINANCE_ACTIONS)[number]["key"];


/** Acesso/visualização é definido por staff_module_visibility.
 * As ações abaixo são permissões extras e independentes; nenhuma é presumida.
 * Agenda/Pauta mantêm a matriz existente de leitura, responsável e gestão.
 */
export const STAFF_MODULE_ACTIONS = [
  { module: "editorial", key: "materias_criar", label: "Criar matérias" },
  { module: "editorial", key: "materias_editar", label: "Editar matérias" },
  { module: "editorial", key: "materias_publicar", label: "Publicar e agendar matérias" },
  { module: "editorial", key: "materias_arquivar", label: "Arquivar matérias" },
  { module: "editorial", key: "midias_gerenciar", label: "Gerenciar mídias" },
  { module: "editorial", key: "edicoes_gerenciar", label: "Gerenciar edições, editorias e destaques" },
  { module: "clientes", key: "clientes_criar", label: "Cadastrar clientes" },
  { module: "clientes", key: "clientes_editar", label: "Editar clientes" },
  { module: "assinaturas", key: "assinaturas_criar", label: "Contratar assinaturas" },
  { module: "assinaturas", key: "assinaturas_editar", label: "Alterar assinaturas" },
  { module: "assinaturas", key: "assinaturas_suspender", label: "Suspender ou reativar assinaturas" },
  { module: "assinaturas", key: "assinaturas_cancelar", label: "Cancelar assinaturas" },
  { module: "publicidade", key: "produtos_gerenciar", label: "Criar e editar produtos/planos" },
  { module: "publicidade", key: "propostas_criar", label: "Criar propostas" },
  { module: "publicidade", key: "propostas_editar", label: "Editar propostas" },
  { module: "publicidade", key: "propostas_aprovar", label: "Aprovar propostas e converter em vendas" },
  { module: "publicidade", key: "vendas_criar", label: "Criar vendas" },
  { module: "publicidade", key: "vendas_editar", label: "Editar vendas" },
  { module: "publicidade", key: "vendas_cancelar", label: "Cancelar vendas" },
  { module: "nfse", key: "rascunhos_criar", label: "Criar rascunhos fiscais" },
  { module: "nfse", key: "rascunhos_editar", label: "Editar rascunhos fiscais" },
  { module: "nfse", key: "notas_emitir", label: "Emitir NFS-e" },
  { module: "nfse", key: "notas_cancelar", label: "Cancelar NFS-e" },
  { module: "nfse", key: "configuracoes_gerenciar", label: "Configurações fiscais e certificados" },
  { module: "aniversariantes", key: "aniversariantes_gerenciar", label: "Cadastrar, editar e retirar aniversariantes" },
  { module: "aniversariantes", key: "mensagens_gerenciar", label: "Gerenciar mensagens e modelos" },
] as const;

export type StaffModuleAction = (typeof STAFF_MODULE_ACTIONS)[number];
export type StaffModuleActionKey = StaffModuleAction["key"];
export type StaffActionModule = StaffModuleAction["module"];
