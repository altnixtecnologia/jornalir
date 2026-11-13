import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { isNfseDeliveryEnabled } from "../../../../lib/nfse/deliveryWorker";
import { verifyResendWebhook } from "../../../../lib/nfse/verifyResendWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendEvent = {type?: string;data?: { email_id?: string }};
/** Somente webhooks assinados podem marcar a mensagem como ENTREGUE. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNfseDeliveryEnabled() || !process.env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({error:"Recebimento desativado."},{status:503});
  }
  const raw = await req.text();
  if (raw.length > 100_000 || !verifyResendWebhook({
    rawBody:raw,
    messageId:req.headers.get("svix-id"),
    timestamp:req.headers.get("svix-timestamp"),
    signatures:req.headers.get("svix-signature"),
    secret:process.env.RESEND_WEBHOOK_SECRET,
  })) return NextResponse.json({error:"Assinatura inválida."},{status:401});
  let payload:ResendEvent;
  try { payload = JSON.parse(raw) as ResendEvent; }
  catch { return NextResponse.json({error:"JSON inválido."},{status:400}); }
  const messageId = payload.data?.email_id;
  if (!messageId || typeof messageId !== "string") return NextResponse.json({received:true});
  let status: "delivered"|"bounced"|"failed"|null = null;
  if (payload.type === "email.delivered") status = "delivered";
  if (payload.type === "email.bounced" || payload.type === "email.complained") status = "bounced";
  if (payload.type === "email.failed") status = "failed";
  if (!status) return NextResponse.json({received:true});
  const admin = createSupabaseAdminClient();
  // Atualiza APENAS uma mensagem enviada pelo provedor, sem incluir XML ou PII.
  const update:Record<string,unknown> = {
    status,updated_at:new Date().toISOString(),
    response_summary: status === "delivered"
      ? "Entrega confirmada pelo provedor."
      : "Provedor relatou falha, devolução ou reclamação do destinatário.",
  };
  if (status === "delivered") update.delivered_at = new Date().toISOString();
  else update.failed_at = new Date().toISOString();
  const {error} = await admin.from("nfse_delivery_attempts")
    .update(update).eq("provider","resend").eq("provider_message_id",messageId)
    .in("status",["accepted","delivered","bounced","failed"]);
  if (error) return NextResponse.json({error:"Falha ao registrar evento."},{status:500});
  return NextResponse.json({received:true});
}
