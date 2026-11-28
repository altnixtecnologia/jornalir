import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { allowedFinanceClient, financeBridgeAuthorized } from "../../../../../lib/integrations/altnixFinanceReadContract";
import { parseFinancePaymentRequest } from "../../../../../lib/integrations/altnixFinancePayment";
import { runFinancePayment } from "../../../../../lib/integrations/financePaymentRuntime";

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
 * Pagamento de título central pelo cliente do Informativo (Pix e cartão de crédito).
 *
 * Reaproveita PaymentChargeService (reserva atômica antes do Asaas, índice único de cobrança pendente — uma por
 * título, de uma forma por vez —, troca de forma/renovação com cancelamento comprovado, recuperação e webhook com
 * confirmação atômica). O Jornal decide titularidade, elegibilidade e valor (sempre o saldo atual); nada disso
 * vem do chamador. Não confirma pagamento, não cria recibo e não altera autorização operacional: isso segue o webhook.
 *
 * Cartão: pela FATURA HOSPEDADA do Asaas (nenhum dado de cartão passa por aqui), à vista ou parcelado conforme a
 * configuração central. Só abre com JORNALIR_FINANCE_CARD_ENABLED=true E allow_credit_card; o retorno ao portal só
 * é enviado ao Asaas com ASAAS_CARD_CALLBACK_ENABLED=true (domínio cadastrado) e é montado a partir de partes validadas.
 *
 * Travas independentes: produção, flag própria, segredo da ponte (>=32) e lista explícita de clientes canônicos.
 *
 * POST { canonicalClientId, receivableId, action: "pix" | "card" | "renew" | "status", installments?, returnPortalCode?, returnRef? }
 *  - "status" nunca cria cobrança.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== "production" || process.env.JORNALIR_FINANCE_PAYMENT_ENABLED !== "true")
    return respond({ error: "Pagamento central não ativado.", code: "payment_disabled" }, 503);
  if (!financeBridgeAuthorized(request.headers.get("authorization"), process.env.JORNALIR_FINANCE_BRIDGE_SECRET))
    return respond({ error: "Não autorizado." }, 401);

  const raw = await request.text();
  if (raw.length > 768) return respond({ error: "Requisição muito extensa." }, 413);
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

    const outcome = await runFinancePayment(db, command);
    return respond(outcome.body, outcome.status);
  } catch {
    return respond({ error: "Pagamento temporariamente indisponível.", code: "unavailable" }, 503);
  }
}
