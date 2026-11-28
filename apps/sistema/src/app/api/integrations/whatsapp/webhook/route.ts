import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { MAX_WEBHOOK_BYTES, parseDeliveryEvents, verifyMetaSignature, webhookChallenge } from "../../../../../lib/notifications/whatsappWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const enabled = () => process.env.VERCEL_ENV === "production" && process.env.WHATSAPP_WEBHOOK_ENABLED === "true";

/**
 * Status de entrega do WhatsApp (Meta). DESLIGADO por padrão: exige produção, WHATSAPP_WEBHOOK_ENABLED,
 * token de verificação e App Secret. Nenhuma configuração do provedor é alterada por este código.
 *
 * GET  → desafio de inscrição (hub.challenge).
 * POST → assinatura X-Hub-Signature-256 verificada sobre o corpo bruto; cada status é aplicado de forma
 *        idempotente e monotônica (accepted < delivered < read; failed não sobrescreve entrega).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!enabled()) return NextResponse.json({ error: "Indisponível." }, { status: 404, headers });
  const challenge = webhookChallenge(request.nextUrl.searchParams, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  return challenge ? new NextResponse(challenge, { status: 200, headers: { ...headers, "Content-Type": "text/plain" } })
    : NextResponse.json({ error: "Não autorizado." }, { status: 403, headers });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!enabled()) return NextResponse.json({ error: "Indisponível." }, { status: 404, headers });
  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "Muito extenso." }, { status: 413, headers });
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET))
    return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers });

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Inválido." }, { status: 400, headers }); }
  const events = parseDeliveryEvents(body);
  if (!events.length) return NextResponse.json({ ok: true, processed: 0 }, { status: 200, headers });

  const admin = createSupabaseAdminClient();
  let applied = 0;
  for (const event of events) {
    const { data, error } = await admin.rpc("whatsapp_apply_delivery_event", {
      p_message_id: event.messageId, p_status: event.status, p_at: event.at, p_error_code: event.errorCode, p_error: event.error,
    });
    // Erro de banco: 500 para a Meta reenviar (a aplicação é idempotente).
    if (error) return NextResponse.json({ error: "Falha ao registrar." }, { status: 500, headers });
    if (data === "applied") applied += 1;
  }
  return NextResponse.json({ ok: true, processed: events.length, applied }, { status: 200, headers });
}
