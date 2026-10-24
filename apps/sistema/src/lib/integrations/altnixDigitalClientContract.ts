/** TRAVA DE RELEASE — decisão do proprietário em 24/10/2026.
 * Não habilitar via variável de ambiente. A conexão com Altnix e o
 * controle de mídias só serão publicados em bloco futuro, após
 * homologação e autorização EXPRESSA. É necessária alteração de código
 * revisada para liberar: não mudar este valor nesta PR.
 */
export const ALTNIX_CLIENT_EXPORT_RELEASED = false as boolean;

/** Contrato mínimo e deliberadamente limitado de cadastro Jornal IR → Altnix.
 * Proibido transportar estados operacionais, dados fiscais internos, crédito,
 * NFS-e, aniversário, mídia, contratos ou playlists.
 */
export type ExportableJornalClient = {
  id: string; kind: "individual" | "company"; status: "active" | "inactive";
  full_name: string | null; company_name: string | null; trade_name: string | null;
  cpf: string | null; cnpj: string | null; phone_primary: string | null;
  email: string | null; address_zip: string | null; address_street: string | null;
  address_number: string | null; address_complement: string | null;
  address_city: string | null; address_state: string | null; updated_at: string;
};
export type AltnixDigitalClient = {
  masterClientId: string; name: string; tradeName: string | null;
  document: string | null; phone: string | null; email: string | null;
  postalCode: string | null; street: string | null; number: string | null;
  complement: string | null; city: string | null; region: string | null;
  updatedAt: string;
};
export function toAltnixDigitalClient(record: ExportableJornalClient): AltnixDigitalClient | null {
  if (record.status !== "active") return null;
  const name = record.kind === "company" ? record.company_name : record.full_name;
  if (!name?.trim()) return null;
  return {
    masterClientId: record.id,
    name: name.trim(),
    tradeName: record.kind === "company" ? record.trade_name : null,
    document: record.kind === "company" ? record.cnpj : record.cpf,
    phone: record.phone_primary, email: record.email,
    postalCode: record.address_zip, street: record.address_street,
    number: record.address_number, complement: record.address_complement,
    city: record.address_city, region: record.address_state,
    updatedAt: record.updated_at,
  };
}

export function sanitizeDigitalClientSearch(search: string): string | null {
  const cleaned = search.trim().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  return cleaned.length >= 2 && cleaned.length <= 70 ? cleaned : null;
}
