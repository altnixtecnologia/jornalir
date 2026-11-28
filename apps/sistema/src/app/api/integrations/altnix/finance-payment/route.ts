import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { PaymentChargeAlreadyPendingError } from "@ir/core";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { getPaymentChargeService } from "../../../../../composition/financeiro";
import { allowedFinanceClient, financeBridgeAuthorized } from "../../../../../lib/integrations/altnixFinanceReadContract";
import { executeFinancePayment, parseFinancePaymentRequest } from "../../../../../lib/integrations/altnixFinancePayment";
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
 * Pagamento Pix de título central pelo cliente do Informativo.
 *
 * Reaproveita PaymentChargeService (reserva atômica antes do Asaas, índice
 * único de cobrança pendente, recuperação e webhook com confirmação atômica
 * existentes). O Jornal decide titularidade, elegibilidade e valor (sempre o
 * saldo atual do título); nada disso vem do chamador. Não confirma pagamento,
 * não cria recibo e não altera autorização operacional: isso segue o webhook.
 * Cartão não é oferecido: não há fluxo seguro de cartão no Jornal (allow_credit_card=false).
 *
 * Travas independentes: produção, flag própria, segredo da ponte (>=32) e lista
 * explícita de clientes canônicos. A decisão em si está em `executeFinancePayment`.
 *
 * POST { canonicalClientId, receivableId, action: "pix" | "status" }
 *  - "status" nunca cria cobrança.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== "production" || process.env.JORNALIR_FINANCE_PAYMENT_ENABLED !== "true")
    return respond({ error: "Pagamento central não ativado.", code: "payment_disabled" }, 503);
  if (!financeBridgeAuthorized(request.headers.get("authorization"), process.env.JORNALIR_FINANCE_BRIDGE_SECRET))
    return respond({ error: "Não autorizado." }, 401);

  const raw = await request.text();
  if (raw.length > 512) return respond({ error: "Requisição muito extensa." }, 413);
  let command: ReturnType<typeof parseFinancePaymentRequest> = null;
  try { command = parseFinancePaymentRequest(JSON.parse(raw)); } catch { command = null; }
  if (!command) return respond({ error: "Requisição inválida." }, 400);
  if (!allowedFinanceClient(command.canonicalClientId, process.env.JORNALIR_FINANCE_BRIDGE_ALLOWED_CLIENT_IDS))
    return respond({ error: "Cadastro não autorizado.", code: "not_allowed" }, 403);

  try {
    const db = createSupabaseAdminClient();
    const { data: client, error: clientError } = await db.from("clients")
      .select("id,client_digital_export_permissions!inner(enabled)")
      .eq("id", command.canonicalClientId).eq("status", "active")
      .eq("client_digital_export_permissions.enabled", true).maybeSingle();
    if (clientError) return respond({ error: "Consulta temporariamente indisponível.", code: "unavailable" }, 503);
    if (!client) return respond({ error: "Cadastro não localizado ou inativo.", code: "not_found" }, 404);

    // Titularidade: o título precisa pertencer ao cliente canônico informado.
    const { data: row, error: rowError } = await db.from("receivables_with_balance")
      .select("id,client_id,status,balance,source_type,commercial_sale_id,internal_reference")
      .eq("id", command.receivableId).eq("client_id", command.canonicalClientId).maybeSingle();
    if (rowError) return respond({ error: "Consulta temporariamente indisponível.", code: "unavailable" }, 503);

    const excluded = row ? (await listReportExcludedReceivableIds(db)).includes(command.receivableId) : false;
    const charges = getPaymentChargeService(db);
    const outcome = await executeFinancePayment(command, {
      receivable: row ? {
        clientId: String(row.client_id), status: String(row.status), balance: Number(row.balance),
        sourceType: (row.source_type as string | null) ?? null,
        commercialSaleId: (row.commercial_sale_id as string | null) ?? null,
        excludedFromReports: excluded,
        reference: (row.internal_reference as string | null) ?? null,
      } : null,
      charges,
      isAlreadyPendingError: (error) => error instanceof PaymentChargeAlreadyPendingError,
      now: () => Date.now(),
    });
    return respond(outcome.body, outcome.status);
  } catch {
    return respond({ error: "Pagamento temporariamente indisponível.", code: "unavailable" }, 503);
  }
}
