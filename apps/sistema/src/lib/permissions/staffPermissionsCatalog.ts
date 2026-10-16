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

