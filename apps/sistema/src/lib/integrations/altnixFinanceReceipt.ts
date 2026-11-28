import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalIdOrNull } from "./altnixFinanceReadContract";

/**
 * Acesso do cliente do Informativo ao recibo JÁ EXISTENTE no Jornal IR.
 * Nada é gerado, duplicado ou armazenado: o recibo é lido de `receivable_receipts` e
 * exibido pelo próprio Jornal numa página acessada por link assinado e de curta duração
 * (nunca uma URL pública permanente). O Jornal valida a titularidade do recibo.
 */
export const RECEIPT_LINK_TTL_MS = 10 * 60 * 1000;
export const JORNAL_RECEIPT_ORIGIN = "https://controle.altnix.com.br";

export type FinanceReceiptRequest = { canonicalClientId: string; receiptId: string };

export function parseFinanceReceiptRequest(raw: unknown): FinanceReceiptRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "canonicalClientId" && key !== "receiptId")) return null;
  const canonicalClientId = canonicalIdOrNull(body.canonicalClientId);
  const receiptId = canonicalIdOrNull(body.receiptId);
  return canonicalClientId && receiptId ? { canonicalClientId, receiptId } : null;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`receipt-link:v1:${payload}`).digest("base64url");
}

/** Token = base64url(JSON) + "." + HMAC. Contém só o necessário e expira em minutos. */
export function signReceiptToken(input: { receiptId: string; canonicalClientId: string }, secret: string, now: number): { token: string; expiresAt: number } {
  const expiresAt = now + RECEIPT_LINK_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ r: input.receiptId, c: input.canonicalClientId, e: expiresAt })).toString("base64url");
  return { token: `${payload}.${signature(payload, secret)}`, expiresAt };
}

export function verifyReceiptToken(token: unknown, secret: string | undefined, now: number): { receiptId: string; canonicalClientId: string } | null {
  if (!secret || secret.length < 32 || typeof token !== "string" || token.length > 400) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = signature(payload, secret);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { r?: unknown; c?: unknown; e?: unknown };
    const receiptId = canonicalIdOrNull(data.r);
    const canonicalClientId = canonicalIdOrNull(data.c);
    if (!receiptId || !canonicalClientId || typeof data.e !== "number" || data.e < now) return null;
    return { receiptId, canonicalClientId };
  } catch { return null; }
}

export type ReceiptOwnershipRow = { receivableClientId: string; reversed: boolean; receivableExcludedFromReports: boolean };

/** Recibo visível ao cliente: pertence ao cliente, não foi estornado e o título não é teste classificado. */
export function receiptVisibleToClient(row: ReceiptOwnershipRow | null, canonicalClientId: string): boolean {
  return Boolean(row) && row!.receivableClientId === canonicalClientId && !row!.reversed && !row!.receivableExcludedFromReports;
}

export type ReceiptLinkOutcome = { status: number; body: Record<string, unknown> };

export function issueFinanceReceiptLink(
  command: FinanceReceiptRequest,
  input: { receipt: ReceiptOwnershipRow | null; secret: string; now: number },
): ReceiptLinkOutcome {
  // Não distingue "inexistente" de "de outro cliente".
  if (!receiptVisibleToClient(input.receipt, command.canonicalClientId))
    return { status: 404, body: { error: "Recibo não encontrado.", code: "not_found" } };
  const { token, expiresAt } = signReceiptToken({ receiptId: command.receiptId, canonicalClientId: command.canonicalClientId }, input.secret, input.now);
  return { status: 200, body: { url: `${JORNAL_RECEIPT_ORIGIN}/recibo/${token}`, expiresAt: new Date(expiresAt).toISOString() } };
}
