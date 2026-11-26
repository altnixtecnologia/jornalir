import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Exclusivamente consulta financeira de conciliação; não compartilha
 * a trava nem as permissões do exportador de CADASTROS digitais.
 * Nenhuma escrita, fatura, Pix, cobrança ou telefone é autorizado aqui.
 */
export const FINANCE_BRIDGE_VERSION = "1" as const;
export const FINANCE_PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canonicalIdOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !UUID.test(value)) return null;
  return value.toLowerCase();
}

export function allowedFinanceClient(id: string, rawAllowlist: string | undefined): boolean {
  if (!rawAllowlist) return false;
  // Acesso deliberadamente limitado à lista explícita dos IDs vinculados.
  return rawAllowlist.split(/[\s,;]+/).some((value) => value.toLowerCase() === id);
}

export function financeBridgeAuthorized(authorization: string | null, configured: string | undefined): boolean {
  if (!configured || configured.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice(7);
  if (!supplied || supplied.length < 32 || supplied.length > 512) return false;
  return timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(configured).digest(),
  );
}

export function parseFinanceOffset(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10_000
    ? value : null;
}

export type JornalFinanceReceivablePreview = {
  id: string;
  status: string;
  originalAmount: number;
  issueDate: string | null;
  dueDate: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceReference: string | null;
  contractId: string | null;
  commercialSaleId: string | null;
  installmentNumber: number | null;
  competencyDate: string | null;
};

export type JornalFinanceReceiptPreview = {
  id: string;
  receivableId: string;
  amount: number;
  receivedAt: string | null;
  reversed: boolean;
};

/** Dados comerciais para revisão explícita; canal é snapshot textual, não prova de vínculo. */
const SERVICE_CHANNELS = ["newspaper","website","led_panel","social_media","package","equipment_rental","other"] as const;
export type JornalFinanceServicePreview = {
  itemKey: string;
  serviceChannel: typeof SERVICE_CHANNELS[number];
};

/** Usa somente a fotografia imutável da negociação. A chave é local à venda,
 * não um UUID de contrato nem autorização financeira. Sem snapshot válido,
 * não deduzir serviço pelo cabeçalho, catálogo atual ou nome do produto. */
export function projectFinanceSaleServices(snapshot: unknown): JornalFinanceServicePreview[] | null {
  if (!Array.isArray(snapshot) || snapshot.length === 0 || snapshot.length > 100) return null;
  const seen = new Set<string>();
  const services: JornalFinanceServicePreview[] = [];
  for (const entry of snapshot) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const key: unknown = entry.sourceProposalItemId;
    const channel: unknown = entry.serviceChannel;
    if (typeof key !== "string" || !key.trim() || key.length > 128 || seen.has(key)
      || !SERVICE_CHANNELS.some(value => value === channel)) return null;
    seen.add(key);
    services.push({itemKey:key,serviceChannel:channel as JornalFinanceServicePreview["serviceChannel"]});
  }
  return services;
}

export type JornalFinanceSalePreview = {
  id: string;
  reference: string;
  channel: string;
  productId: string | null;
  condition: string;
  status: string;
  startDate: string;
  endDate: string | null;
  installmentsCount: number;
  services: JornalFinanceServicePreview[] | null;
};

export type JornalFinancePreviewResponse = {
  version: typeof FINANCE_BRIDGE_VERSION;
  source: "jornal_ir";
  mode: "readonly";
  financeCutoverActive: false;
  canonicalClientId: string;
  total: number;
  offset: number;
  hasMore: boolean;
  receivables: JornalFinanceReceivablePreview[];
  receipts: JornalFinanceReceiptPreview[];
  receiptsComplete: boolean;
  sales: JornalFinanceSalePreview[];
  salesTotal: number;
  salesComplete: boolean;
};
