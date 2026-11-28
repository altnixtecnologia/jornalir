import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { runFinancePayment } from "../../../../../../lib/integrations/financePaymentRuntime";
import { JORNAL_PAYMENT_ORIGIN, MAX_CARD_INSTALLMENTS, type FinancePaymentRequest } from "../../../../../../lib/integrations/altnixFinancePayment";
import { PUBLIC_TOKEN_PATTERN, buildPublicReturnUrl } from "../../../../../../lib/financeiro/cardPaymentUrls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COOLDOWN_MS = 20_000;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/**
 * Troca da forma de pagamento (Pix ⇄ cartão) na página pública de pagamento. A autoridade é a posse do token
 * aleatório da cobrança (mesmo modelo da página); toda a decisão é a mesma da ponte do Informativo
 * (executeFinancePayment → PaymentChargeService.openCharge): uma cobrança pendente por título, cancelamento
 * comprovado antes de emitir outra, nunca substituir pagamento recebido/confirmado. Desligada por padrão.
 * Intervalo mínimo entre trocas (a nova cobrança é o registro durável do intervalo).
 *
 * POST { method: "pix" | "card", installments? }
 */
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== "production" || process.env.JORNALIR_PUBLIC_METHOD_SWITCH_ENABLED !== "true")
    return respond({ error: "Troca de forma de pagamento indisponível.", code: "method_unavailable" }, 503);
  const { token } = await props.params;
  if (!PUBLIC_TOKEN_PATTERN.test(token)) return respond({ error: "Cobrança não encontrada." }, 404);
  const raw = await request.text();
  if (raw.length > 200) return respond({ error: "Requisição muito extensa." }, 413);
  let body: { method?: unknown; installments?: unknown };
  try { body = JSON.parse(raw) as typeof body; } catch { return respond({ error: "Requisição inválida." }, 400); }
  if (body.method !== "pix" && body.method !== "card") return respond({ error: "Requisição inválida." }, 400);
  if (body.installments !== undefined && (body.method !== "card" || typeof body.installments !== "number"
    || !Number.isInteger(body.installments) || body.installments < 1 || body.installments > MAX_CARD_INSTALLMENTS))
    return respond({ error: "Requisição inválida." }, 400);

  try {
    const db = createSupabaseAdminClient();
    const { data: charge } = await db.from("payment_charges")
      .select("id,receivable_id,client_id,status,expires_at").eq("public_token", token).maybeSingle();
    if (!charge) return respond({ error: "Cobrança não encontrada." }, 404);

    // Intervalo mínimo desde a última cobrança do título (evita rajadas de cancelar/criar no provedor).
    const { data: latest } = await db.from("payment_charges").select("created_at")
      .eq("receivable_id", charge.receivable_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest && Date.now() - Date.parse(String(latest.created_at)) < COOLDOWN_MS)
      return respond({ error: "Aguarde alguns segundos antes de trocar a forma de pagamento.", code: "too_fast" }, 429);

    const expired = charge.status === "expired" || (charge.expires_at && Date.parse(String(charge.expires_at)) < Date.now());
    const command: FinancePaymentRequest = {
      canonicalClientId: String(charge.client_id), receivableId: String(charge.receivable_id),
      action: body.method === "card" ? "card" : expired ? "renew" : "pix",
      ...(body.method === "card" ? { installments: (body.installments as number | undefined) ?? 1 } : {}),
    };
    const cardSuccessUrl = body.method === "card" && process.env.ASAAS_CARD_CALLBACK_ENABLED === "true"
      ? buildPublicReturnUrl(JORNAL_PAYMENT_ORIGIN, token) : null;
    const outcome = await runFinancePayment(db, command, { cardSuccessUrl });
    // Só o subconjunto seguro para o cliente; nunca IDs internos.
    const { charge: safe, methods, error, code } = outcome.body as { charge?: unknown; methods?: unknown; error?: string; code?: string };
    return respond(error ? { error, code } : { charge: safe, methods }, outcome.status);
  } catch {
    return respond({ error: "Pagamento temporariamente indisponível.", code: "unavailable" }, 503);
  }
}
