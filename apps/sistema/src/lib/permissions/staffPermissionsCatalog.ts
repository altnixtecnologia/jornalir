/** Catálogo de permissões disponíveis aos operadores.
 * Administradores e proprietário possuem acesso integral independentemente das tabelas.
 * TODO: a UI só deve ser publicada junto aos guardas de middleware, ações e RLS.
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

export const FINANCE_ACTION_GROUPS = [
  { label: "Contas a receber", items: [
    { key: "titulos_criar", label: "Criar títulos" },
    { key: "titulos_editar", label: "Editar títulos" },
    { key: "titulos_cancelar", label: "Cancelar títulos" },
    { key: "titulos_reabrir", label: "Reabrir títulos cancelados" },
  ] },
  { label: "Cobranças Pix", items: [
    { key: "pix_gerar", label: "Gerar cobrança Pix" },
    { key: "pix_enviar", label: "Enviar cobrança Pix pelo WhatsApp" },
    { key: "pix_cancelar", label: "Cancelar cobrança Pix" },
  ] },
  { label: "Recebimentos e ajustes", items: [
    { key: "recebimentos_baixar", label: "Dar baixa manual / registrar recebimento" },
    { key: "recebimentos_quitar_diferenca", label: "Quitar com diferença" },
    { key: "recebimentos_estornar", label: "Estornar recebimentos" },
    { key: "ajustes_criar", label: "Aplicar abatimentos e ajustes" },
    { key: "ajustes_estornar", label: "Estornar ajustes" },
    { key: "creditos_aplicar", label: "Aplicar crédito de cliente" },
  ] },
  { label: "Relatórios e contratos", items: [
    { key: "relatorios_ver", label: "Visualizar relatórios financeiros" },
    { key: "relatorios_exportar", label: "Exportar relatórios" },
    { key: "contratos_criar", label: "Criar contratos" },
    { key: "contratos_editar", label: "Editar contratos" },
  ] },
] as const;
export type FinanceActionKey = (typeof FINANCE_ACTION_GROUPS)[number]["items"][number]["key"];
