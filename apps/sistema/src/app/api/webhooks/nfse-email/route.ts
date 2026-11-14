import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { handleResendWebhook } from "../../../../lib/nfse/resendWebhookHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook do Resend: só confirma ou contesta entregas de tentativas já existentes.
 * NÃO depende da liberação da emissão fiscal/envio automático; exige RESEND_WEBHOOK_SECRET e assinatura Svix válida.
 * Não envia e-mail, não emite nota e não expõe documento ou dado fiscal.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const result = await handleResendWebhook({
    rawBody: raw,
    headers: {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    secret: process.env.RESEND_WEBHOOK_SECRET,
    getAdmin: createSupabaseAdminClient,
  });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
