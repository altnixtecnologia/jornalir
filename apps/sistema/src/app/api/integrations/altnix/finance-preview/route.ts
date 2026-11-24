import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  FINANCE_BRIDGE_VERSION, FINANCE_PAGE_SIZE, allowedFinanceClient,
  canonicalIdOrNull, financeBridgeAuthorized, parseFinanceOffset,
  type JornalFinancePreviewResponse,
} from "../../../../../lib/integrations/altnixFinanceReadContract";

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
 * Consulta para conciliação de contratos legados (NUNCA migra dinheiro).
 * O endpoint cadastral antigo continua bloqueado e não é alterado aqui.
 * Ativação exclusivamente manual: segredo >=32, allowlist de clientes
 * canônicos e flag de leitura na Production (três travas independentes).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== "production"
    || process.env.JORNALIR_FINANCE_BRIDGE_READ_ENABLED !== "true") {
    return respond({ error: "Conciliação financeira não ativada." }, 503);
  }
  if (!financeBridgeAuthorized(
    request.headers.get("authorization"), process.env.JORNALIR_FINANCE_BRIDGE_SECRET,
  )) return respond({ error: "Não autorizado." }, 401);

  const raw = await request.text();
  if (raw.length > 512) return respond({ error: "Requisição muito extensa." }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return respond({ error: "Requisição inválida." }, 400);
  }
  const id = canonicalIdOrNull(body.canonicalClientId);
  const offset = parseFinanceOffset(body.offset);
  if (!id || offset === null) return respond({ error: "Identificador ou paginação inválidos." }, 400);
  if (!allowedFinanceClient(id, process.env.JORNALIR_FINANCE_BRIDGE_ALLOWED_CLIENT_IDS)) {
    return respond({ error: "Cadastro não autorizado para conciliação." }, 403);
  }

  try {
    const db = createSupabaseAdminClient();
    const { data: client, error: clientError } = await db.from("clients")
      .select("id").eq("id", id).eq("status", "active").maybeSingle();
    if (clientError) return respond({ error: "Consulta temporariamente indisponível." }, 503);
    if (!client) return respond({ error: "Cadastro não localizado ou inativo." }, 404);

    const { data, error, count } = await db.from("receivables")
      .select(
        "id,status,original_amount,issue_date,due_date,source_type,source_id,source_reference,contract_id",
        { count: "exact" },
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + FINANCE_PAGE_SIZE - 1);
    if (error) return respond({ error: "Consulta temporariamente indisponível." }, 503);
    const receivables = (data ?? []).map((row) => ({
      id: row.id as string,
      status: row.status as string,
      originalAmount: Number(row.original_amount),
      issueDate: row.issue_date as string | null,
      dueDate: row.due_date as string | null,
      sourceType: row.source_type as string | null,
      sourceId: row.source_id as string | null,
      sourceReference: row.source_reference as string | null,
      contractId: row.contract_id as string | null,
    }));
    const ids = receivables.map((row) => row.id);
    let receipts: JornalFinancePreviewResponse["receipts"] = [];
    if (ids.length) {
      const { data: paid, error: paidError } = await db.from("receivable_receipts")
        .select("receivable_id,amount,received_at,reversed_at")
        .in("receivable_id", ids);
      if (paidError) return respond({ error: "Consulta temporariamente indisponível." }, 503);
      receipts = (paid ?? []).map((row) => ({
        receivableId: row.receivable_id as string,
        amount: Number(row.amount),
        receivedAt: row.received_at as string | null,
        reversed: Boolean(row.reversed_at),
      }));
    }

    const response: JornalFinancePreviewResponse = {
      version: FINANCE_BRIDGE_VERSION,
      source: "jornal_ir",
      mode: "readonly",
      financeCutoverActive: false,
      canonicalClientId: id,
      total: count ?? 0,
      offset,
      hasMore: offset + receivables.length < (count ?? 0),
      receivables,
      receipts,
    };
    return respond(response);
  } catch {
    return respond({ error: "Conciliação temporariamente indisponível." }, 503);
  }
}
