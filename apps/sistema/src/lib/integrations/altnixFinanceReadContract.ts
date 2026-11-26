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
};
