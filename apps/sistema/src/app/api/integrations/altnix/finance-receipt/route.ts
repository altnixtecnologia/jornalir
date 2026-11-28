import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { allowedFinanceClient, financeBridgeAuthorized } from "../../../../../lib/integrations/altnixFinanceReadContract";
import { issueFinanceReceiptLink, parseFinanceReceiptRequest } from "../../../../../lib/integrations/altnixFinanceReceipt";
import { listReportExcludedReceivableIds } from "../../../../../providers/supabase/receivableReportExclusion.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function respond(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Link temporário (10 min, assinado) para o recibo existente de um cliente do Informativo.
 * Não gera, duplica nem grava recibo: só valida titularidade e emite o link. Travas
 * independentes: produção, flag própria, segredo da ponte (>=32) e allowlist canônica.
 *
 * POST { canonicalClientId, receiptId }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== "production" || process.env.JORNALIR_FINANCE_RECEIPT_ENABLED !== "true")
    return respond({ error: "Recibo central não ativado.", code: "receipt_disabled" }, 503);
  const secret = process.env.JORNALIR_FINANCE_BRIDGE_SECRET;
  if (!financeBridgeAuthorized(request.headers.get("authorization"), secret) || !secret)
    return respond({ error: "Não autorizado." }, 401);

  const raw = await request.text();
  if (raw.length > 512) return respond({ error: "Requisição muito extensa." }, 413);
  let command: ReturnType<typeof parseFinanceReceiptRequest> = null;
  try { command = parseFinanceReceiptRequest(JSON.parse(raw)); } catch { command = null; }
  if (!command) return respond({ error: "Requisição inválida." }, 400);
  if (!allowedFinanceClient(command.canonicalClientId, process.env.JORNALIR_FINANCE_BRIDGE_ALLOWED_CLIENT_IDS))
    return respond({ error: "Cadastro não autorizado.", code: "not_allowed" }, 403);

  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("receivable_receipts")
      .select("id,reversed_at,receivable_id,receivables!inner(client_id)")
      .eq("id", command.receiptId).eq("receivables.client_id", command.canonicalClientId).maybeSingle();
    if (error) return respond({ error: "Consulta temporariamente indisponível.", code: "unavailable" }, 503);
    const embedded = data?.receivables as { client_id?: string } | Array<{ client_id?: string }> | null | undefined;
    const receivableClientId = (Array.isArray(embedded) ? embedded[0]?.client_id : embedded?.client_id) ?? "";
    const excluded = data ? (await listReportExcludedReceivableIds(db)).includes(String(data.receivable_id)) : false;
    const outcome = issueFinanceReceiptLink(command, {
      receipt: data ? { receivableClientId, reversed: Boolean(data.reversed_at), receivableExcludedFromReports: excluded } : null,
      secret, now: Date.now(),
    });
    return respond(outcome.body, outcome.status);
  } catch {
    return respond({ error: "Recibo temporariamente indisponível.", code: "unavailable" }, 503);
  }
}
