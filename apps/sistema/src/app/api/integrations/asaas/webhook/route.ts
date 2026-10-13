import "server-only";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPaymentChargeService } from "../../../../../composition/financeiro";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AsaasWebhookPayment {
  id?: string;
  status?: string;
  billingType?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  confirmedDate?: string;
}

interface AsaasWebhookPayload {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: AsaasWebhookPayment;
  [key: string]: unknown;
}

function constantTimeEquals(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function receivedDate(payment: AsaasWebhookPayment | undefined): string {
  for (const value of [payment?.clientPaymentDate, payment?.paymentDate, payment?.confirmedDate]) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

async function markEvent(
  eventId: string,
  values: { processed_at?: string | null; error_message?: string | null },
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("billing_webhook_events").update(values).eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken || !hasServiceRoleKey()) {
    return NextResponse.json({ error: "Integração de cobrança não configurada." }, { status: 503 });
  }

  const receivedToken = request.headers.get("asaas-access-token") ?? "";
  if (!receivedToken || !constantTimeEquals(receivedToken, expectedToken)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = (await request.json()) as AsaasWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const eventId = typeof payload.id === "string" ? payload.id.trim() : "";
  const eventType = typeof payload.event === "string" ? payload.event.trim() : "";
  const providerChargeId = typeof payload.payment?.id === "string" ? payload.payment.id.trim() : null;

  if (!eventId || !eventType) {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: previous, error: previousError } = await admin
    .from("billing_webhook_events")
    .select("id, processed_at")
    .eq("id", eventId)
    .maybeSingle();

  if (previousError) {
    return NextResponse.json({ error: "Falha ao consultar idempotência." }, { status: 500 });
  }

  if (previous?.processed_at) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!previous) {
    const { error: insertError } = await admin.from("billing_webhook_events").insert({
      id: eventId,
      provider: "asaas",
      event_type: eventType,
      provider_charge_id: providerChargeId,
      payload,
    });

    // Uma entrega concorrente do mesmo evento pode ganhar a corrida do INSERT.
    // A regra de negócio abaixo continua segura porque confirm_payment_charge
    // também é idempotente no banco.
    if (insertError && insertError.code !== "23505") {
      return NextResponse.json({ error: "Falha ao registrar evento." }, { status: 500 });
    }
  } else {
    const { error: refreshError } = await admin
      .from("billing_webhook_events")
      .update({
        event_type: eventType,
        provider_charge_id: providerChargeId,
        payload,
        error_message: null,
      })
      .eq("id", eventId);
    if (refreshError) {
      return NextResponse.json({ error: "Falha ao atualizar evento." }, { status: 500 });
    }
  }

  try {
    if (!providerChargeId) {
      await markEvent(eventId, {
        processed_at: new Date().toISOString(),
        error_message: "Evento sem payment.id; nenhuma cobrança local alterada.",
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const { data: charge, error: chargeError } = await admin
      .from("payment_charges")
      .select("id, receivable_id, status, receipt_id")
      .eq("provider", "asaas")
      .eq("provider_charge_id", providerChargeId)
      .maybeSingle();

    if (chargeError) throw new Error(chargeError.message);

    // A mesma conta Asaas pode conter cobranças de outros sistemas.
    // Evento sem correspondência local é registrado e reconhecido com 200
    // para não interromper a fila do provedor.
    if (!charge) {
      await markEvent(eventId, {
        processed_at: new Date().toISOString(),
        error_message: "Cobrança Asaas não pertence ao JornalIR; evento ignorado.",
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (eventType === "PAYMENT_RECEIVED") {
      await getPaymentChargeService(admin).confirmPixCharge(
        charge.id as string,
        receivedDate(payload.payment),
        undefined,
      );
    } else if (eventType === "PAYMENT_DELETED") {
      if (charge.status === "pending") {
        const { error } = await admin
          .from("payment_charges")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "Cobrança removida no Asaas.",
          })
          .eq("id", charge.id);
        if (error) throw new Error(error.message);
      }
    } else if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_PARTIALLY_REFUNDED") {
      // Não altera o recebimento automaticamente: estorno financeiro precisa
      // manter trilha própria e pode envolver valor parcial. O evento fica
      // registrado para conciliação sem bloquear a fila do Asaas.
      await markEvent(eventId, {
        processed_at: new Date().toISOString(),
        error_message: "Estorno recebido do Asaas; requer conciliação no Financeiro.",
      });
      return NextResponse.json({ ok: true, manualReconciliation: true });
    }

    await markEvent(eventId, { processed_at: new Date().toISOString(), error_message: null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar webhook.";
    try {
      await markEvent(eventId, { error_message: message.slice(0, 1000), processed_at: null });
    } catch {
      // Mantém a resposta de erro original; o Asaas poderá reenviar o evento.
    }
    return NextResponse.json({ error: "Falha ao processar evento." }, { status: 500 });
  }
}
