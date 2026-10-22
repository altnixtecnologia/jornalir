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
