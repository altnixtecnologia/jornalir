/**
 * Prévia de conciliação Jornal IR ↔ Altnix Informativo.
 * FUNÇÃO PURA: não consulta bancos, não envia dados, não cria vínculos
 * e não concede acesso a portais, mídias, cobranças ou equipamentos.
 */
export type InformativoAdvertiserIdentity = {
  tenantId: string; // public.clients no Informativo = organização/tenant
  adClientId: string; // public.ad_clients = anunciante
  document: string | null;
  mediaCount: number; // somente informação de inventário, NÃO prova direito de acesso
};

export type JornalMasterClientIdentity = {
  clientId: string; // public.clients no Jornal IR = pessoa/empresa
  cpf: string | null;
  cnpj: string | null;
};

/** Vínculo confirmado manualmente em etapa futura; ainda não há persistência. */
export type ConfirmedAdvertiserLink = {
  tenantId: string;
  adClientId: string;
  masterClientId: string;
};

export type LinkPreviewReason =
  | "confirmed_link"
  | "candidate_exact_document"
  | "missing_or_invalid_document"
  | "no_master_document_match"
  | "ambiguous_master_document"
  | "conflicting_confirmed_links"
  | "confirmed_master_not_found"
  | "confirmed_document_mismatch"
  | "duplicate_source_record";

export type AdvertiserLinkPreview = {
  tenantId: string;
  adClientId: string;
  mediaCount: number;
  status: "confirmed" | "candidate_only" | "manual_review";
  masterClientId: string | null;
  reason: LinkPreviewReason;
};

function normalizedDocument(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

function sourceKey(tenantId: string, adClientId: string): string {
  // JSON impede colisões de chaves quando os IDs são strings arbitrárias.
  return JSON.stringify([tenantId, adClientId]);
}

/**
 * Uma correspondência de CPF/CNPJ é APENAS sugestão para revisão humana.
 * Mesmo status "confirmed" aqui NÃO habilita sincronização, login ou mídia.
 * O mesmo cliente mestre pode ter vários anunciantes de origem em cidades distintas.
 */
export function previewInformativoAdvertiserLinks(
  advertisers: readonly InformativoAdvertiserIdentity[],
  masterClients: readonly JornalMasterClientIdentity[],
  confirmedLinks: readonly ConfirmedAdvertiserLink[] = [],
): AdvertiserLinkPreview[] {
  const masterById = new Map(masterClients.map((row) => [row.clientId, row]));
  const masterByDocument = new Map<string, Set<string>>();
  for (const master of masterClients) {
    for (const document of [master.cpf, master.cnpj]) {
      const value = normalizedDocument(document);
      if (!value) continue;
      if (!masterByDocument.has(value)) masterByDocument.set(value, new Set());
      masterByDocument.get(value)!.add(master.clientId);
    }
  }
  const confirmedBySource = new Map<string, Set<string>>();
  for (const link of confirmedLinks) {
    const key = sourceKey(link.tenantId, link.adClientId);
    if (!confirmedBySource.has(key)) confirmedBySource.set(key, new Set());
    confirmedBySource.get(key)!.add(link.masterClientId);
  }
  const sourceCount = new Map<string, number>();
  for (const item of advertisers) {
    const key = sourceKey(item.tenantId, item.adClientId);
    sourceCount.set(key, (sourceCount.get(key) ?? 0) + 1);
  }

  return advertisers.map((source) => {
    const key = sourceKey(source.tenantId, source.adClientId);
    const base = { tenantId: source.tenantId, adClientId: source.adClientId, mediaCount: source.mediaCount };
    const review = (reason: LinkPreviewReason): AdvertiserLinkPreview =>
      ({ ...base, status: "manual_review", masterClientId: null, reason });
    if ((sourceCount.get(key) ?? 0) !== 1) return review("duplicate_source_record");
    const linked = [...(confirmedBySource.get(key) ?? [])];
    if (linked.length > 1) return review("conflicting_confirmed_links");
    const sourceDocument = normalizedDocument(source.document);
    if (linked.length === 1) {
      const target = masterById.get(linked[0]);
      if (!target) return review("confirmed_master_not_found");
      const targetDocuments = [target.cpf, target.cnpj].map(normalizedDocument).filter(Boolean);
      if (sourceDocument && targetDocuments.length && !targetDocuments.includes(sourceDocument)) {
        return review("confirmed_document_mismatch");
      }
      return { ...base, status: "confirmed", masterClientId: linked[0], reason: "confirmed_link" };
    }
    if (!sourceDocument) return review("missing_or_invalid_document");
    const candidates = [...(masterByDocument.get(sourceDocument) ?? [])];
    if (candidates.length === 0) return review("no_master_document_match");
    if (candidates.length > 1) return review("ambiguous_master_document");
    return { ...base, status: "candidate_only", masterClientId: candidates[0], reason: "candidate_exact_document" };
  });
}
