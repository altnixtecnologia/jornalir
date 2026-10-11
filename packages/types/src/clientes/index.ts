// Módulo Clientes (Fase 1) — cadastro central único de pessoas e empresas.
// Só identidade e contato; assinaturas/financeiro/publicidade são módulos
// futuros que vão referenciar `clientId`, nunca ganhar campos aqui.

export type ClientKind = "individual" | "company";
export type ClientStatus = "active" | "inactive";
/** Situação perante o ICMS — opcional, foco atual é NFS-e (ISSQN). */
export type ClientIcmsStatus = "contribuinte" | "isento" | "nao_contribuinte";

export const CLIENT_ICMS_STATUS_LABELS: Record<ClientIcmsStatus, string> = {
  contribuinte: "Contribuinte",
  isento: "Isento",
  nao_contribuinte: "Não contribuinte",
};

/** Papéis que o mesmo cadastro pode acumular — nenhuma funcionalidade
 * específica de cada papel é implementada nesta fase, só o vínculo. */
export type ClientRole = "cliente" | "assinante" | "anunciante" | "parceiro" | "fornecedor";

export const CLIENT_ROLES: readonly ClientRole[] = ["cliente", "assinante", "anunciante", "parceiro", "fornecedor"];

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  cliente: "Cliente",
  assinante: "Assinante",
  anunciante: "Anunciante",
  parceiro: "Parceiro",
  fornecedor: "Fornecedor",
};

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  individual: "Pessoa física",
  company: "Pessoa jurídica",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export interface ClientAddress {
  zip?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface Client {
  id: string;
  reference: string;
  kind: ClientKind;
  status: ClientStatus;

  // Pessoa física
  fullName?: string;
  cpf?: string;
  birthDate?: string;

  // Pessoa jurídica
  companyName?: string;
  tradeName?: string;
  cnpj?: string;
  stateRegistration?: string;
  responsibleName?: string;
  responsibleCpf?: string;

  // Contato — comum aos dois tipos
  phonePrimary?: string;
  phoneSecondary?: string;
  whatsapp?: string;
  email?: string;
  /** Opcional — endereço preferencial para comunicação fiscal/NFS-e. Quando vazio, a aplicação usa `email` como fallback (regra só da aplicação, nunca duplicada no banco). */
  fiscalEmail?: string;

  // Fiscal — opcionais, preparados para NFS-e (ver 20261025100000_clients_fiscal_fields.sql).
  /** Inscrição municipal — relevante principalmente para PJ. */
  municipalRegistration?: string;
  /** Código IBGE do município do endereço (7 dígitos). */
  addressIbgeCode?: string;
  icmsStatus?: ClientIcmsStatus;

  address: ClientAddress;
  notes?: string;
  roles: ClientRole[];

  createdAt: string;
  updatedAt: string;
}

/** Nome de exibição — razão social (ou nome fantasia, se houver) pra
 * pessoa jurídica, nome completo pra pessoa física. Usado em toda a UI em
 * vez de repetir essa escolha em cada componente. */
export function clientDisplayName(client: Pick<Client, "kind" | "fullName" | "companyName" | "tradeName">): string {
  if (client.kind === "company") return client.tradeName || client.companyName || "(sem nome)";
  return client.fullName || "(sem nome)";
}
