/** Homologação de leitura autorizada em 26/11/2026. O ambiente ainda
 * precisa liberar ALTNIX_CLIENT_SYNC_ENABLED; autenticação e aprovação
 * explícita por cliente continuam obrigatórias. Escrita permanece desligada. */
export const ALTNIX_CLIENT_EXPORT_RELEASED = true as boolean;

/** Contrato mínimo e deliberadamente limitado de cadastro Jornal IR → Altnix.
 * Proibido transportar estados operacionais, dados fiscais internos, crédito,
 * NFS-e, aniversário, mídia, contratos ou playlists.
 */
export type ExportableJornalClient = {
  id: string; kind: "individual" | "company"; status: "active" | "inactive";
  full_name: string | null; company_name: string | null; trade_name: string | null;
  cpf: string | null; cnpj: string | null; phone_primary: string | null; whatsapp?: string | null;
  email: string | null; address_zip: string | null; address_street: string | null;
  address_number: string | null; address_complement: string | null;
  address_city: string | null; address_state: string | null; updated_at: string;
};
export type AltnixDigitalClient = {
  masterClientId: string; name: string; tradeName: string | null;
  document: string | null; phone: string | null; whatsapp?: string | null; email: string | null;
  postalCode: string | null; street: string | null; number: string | null;
  complement: string | null; city: string | null; region: string | null;
  updatedAt: string;
};
export function toAltnixDigitalClient(record: ExportableJornalClient, includeCanonicalContact = false): AltnixDigitalClient | null {
  if (record.status !== "active") return null;
  const name = record.kind === "company" ? record.company_name : record.full_name;
  if (!name?.trim()) return null;
  return {
    masterClientId: record.id,
    name: name.trim(),
    tradeName: record.kind === "company" ? record.trade_name : null,
    document: record.kind === "company" ? record.cnpj : record.cpf,
    phone: record.phone_primary, email: record.email,
    ...(includeCanonicalContact ? { whatsapp: record.whatsapp ?? null } : {}),
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


/** Consulta em lote apenas por UUIDs já conhecidos pelo serviço. */
export const DIGITAL_CLIENT_BATCH_LIMIT = 20;
const DIGITAL_CLIENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseDigitalClientIds(raw: string): string[] | null {
  const ids = raw.split(",").map((id) => id.trim().toLowerCase());
  if (!ids.length || ids.length > DIGITAL_CLIENT_BATCH_LIMIT ||
      ids.some((id) => !DIGITAL_CLIENT_UUID.test(id)) ||
      new Set(ids).size !== ids.length) return null;
  return ids;
}
