import "server-only";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPaymentChargeService } from "../../../../../composition/financeiro";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../../../lib/supabase/admin";
import { getAsaasWebhookToken } from "../../../../../lib/financeiro/asaasWebhookConfig";
import { createAsaasPixProvider } from "../../../../../lib/financeiro/asaasPixProvider";
import {
  isWhatsappCloudConfigured,
  sendWhatsappPaymentConfirmedTemplate,
} from "../../../../../lib/financeiro/whatsappCloudProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AsaasWebhookPayment {
  id?: string;
  status?: string;
  billingType?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  confirmedDate?: string;
  externalReference?: string;
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

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function createPanelNotification(input: {
  kind: "payment_received" | "payment_cancelled" | "payment_overdue" | "whatsapp_failed";
  title: string;
  message: string;
  href: string;
  entityId: string;
  eventKey: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("admin_notifications").upsert(
    {
      kind: input.kind,
      title: input.title,
      message: input.message,
      href: input.href,
      entity_type: "receivable",
      entity_id: input.entityId,
      event_key: input.eventKey,
    },
    { onConflict: "event_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

async function loadPaymentContext(receivableId: string): Promise<{
  receivable: {
    id: string;
    internal_reference: string | null;
    description: string | null;
    client_id: string;
  };
  client: {
    id: string;
    full_name: string | null;
    company_name: string | null;
    trade_name: string | null;
    whatsapp: string | null;
    phone_primary: string | null;
  };
}> {
  const admin = createSupabaseAdminClient();
  const { data: receivable, error: receivableError } = await admin
    .from("receivables")
    .select("id, internal_reference, description, client_id")
    .eq("id", receivableId)
    .single();
  if (receivableError || !receivable) throw new Error(receivableError?.message ?? "Título não encontrado.");

  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, full_name, company_name, trade_name, whatsapp, phone_primary")
    .eq("id", receivable.client_id)
    .single();
  if (clientError || !client) throw new Error(clientError?.message ?? "Cliente não encontrado.");

  return { receivable, client };
}

async function notifyPaymentReceived(input: {
  eventId: string;
  receivableId: string;
  amount: number;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { receivable, client } = await loadPaymentContext(input.receivableId);
  const reference = receivable.internal_reference || receivable.description || "Título financeiro";
  const clientName = client.trade_name || client.full_name || client.company_name || "Cliente";
  const amountLabel = money(input.amount);
  const href = `/sistema/financeiro/contas-a-receber/${receivable.id}`;

  await createPanelNotification({
    kind: "payment_received",
    title: "Pagamento recebido",
    message: `${clientName} • ${amountLabel} • ${reference}`,
    href,
    entityId: receivable.id,
    eventKey: `asaas:${input.eventId}:payment_received`,
  });

  const toPhone = client.whatsapp || client.phone_primary || "";
  if (!toPhone) {
    await createPanelNotification({
      kind: "whatsapp_failed",
      title: "WhatsApp de confirmação não enviado",
      message: `${clientName} não possui WhatsApp/telefone cadastrado para confirmar o pagamento de ${amountLabel}.`,
      href,
      entityId: receivable.id,
      eventKey: `asaas:${input.eventId}:whatsapp_no_phone`,
    });
    return;
  }

  if (!isWhatsappCloudConfigured()) {
    await createPanelNotification({
      kind: "whatsapp_failed",
      title: "WhatsApp de confirmação pendente",
      message: `Pagamento de ${amountLabel} confirmado, mas a WhatsApp Cloud API ainda não está configurada no JornalIR.`,
      href,
      entityId: receivable.id,
      eventKey: `asaas:${input.eventId}:whatsapp_not_configured`,
    });
    return;
  }

  try {
    const sent = await sendWhatsappPaymentConfirmedTemplate({
      toPhone,
      clientName,
      amountLabel,
      reference,
    });

    const { error: logError } = await admin.from("billing_message_logs").insert({
      receivable_id: receivable.id,
      client_id: client.id,
      channel: "whatsapp",
      to_phone: toPhone,
      message: `Pagamento confirmado: ${amountLabel} • ${reference}`,
      status: "sent",
      provider_message_id: sent.providerMessageId ?? null,
      error_message: null,
      created_by: null,
    });
    if (logError) throw new Error(logError.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar confirmação pelo WhatsApp.";
    await admin.from("billing_message_logs").insert({
      receivable_id: receivable.id,
      client_id: client.id,
      channel: "whatsapp",
      to_phone: toPhone,
      message: `Pagamento confirmado: ${amountLabel} • ${reference}`,
      status: "failed",
      provider_message_id: null,
      error_message: message.slice(0, 1000),
      created_by: null,
    });

    await createPanelNotification({
      kind: "whatsapp_failed",
      title: "Falha ao confirmar pagamento no WhatsApp",
      message: `${clientName} • ${amountLabel} • ${message}`,
      href,
      entityId: receivable.id,
      eventKey: `asaas:${input.eventId}:whatsapp_failed`,
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = getAsaasWebhookToken();
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
      .select("id, receivable_id, status, receipt_id, amount")
      .eq("provider", "asaas")
      .eq("provider_charge_id", providerChargeId)
      .maybeSingle();

    if (chargeError) throw new Error(chargeError.message);

    // Há uma janela curta entre criar a cobrança no Asaas e persistir
    // payment_charges localmente. Se o webhook chegar nessa janela e a
    // externalReference apontar para um título REAL deste banco, devolve
    // erro temporário para o Asaas reenviar — nunca perde um pagamento.
    if (!charge) {
      const externalReference = payload.payment?.externalReference ?? "";
      const match = /^receivable:([0-9a-f-]{36})$/i.exec(externalReference);
      if (match) {
        const { data: receivable, error: receivableError } = await admin
          .from("receivables")
          .select("id")
          .eq("id", match[1])
          .maybeSingle();
        if (receivableError) throw new Error(receivableError.message);
        if (receivable) {
          await markEvent(eventId, {
            processed_at: null,
            error_message: "Cobrança local ainda não persistida; aguardando reenvio do Asaas.",
          });
          return NextResponse.json({ error: "Cobrança local ainda não disponível." }, { status: 503 });
        }
      }

      // A mesma conta Asaas pode conter cobranças de outros sistemas.
      // Se não aponta para um título do JornalIR, reconhece com 200 para
      // não interromper a fila compartilhada do provedor.
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
      await notifyPaymentReceived({
        eventId,
        receivableId: charge.receivable_id as string,
        amount: Number(charge.amount ?? 0),
      });
    } else if (eventType === "PAYMENT_OVERDUE") {
      if (charge.status === "pending") {
        await createAsaasPixProvider(admin).cancelCharge(providerChargeId);
        const { error } = await admin
          .from("payment_charges")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "Cobrança vencida; removida automaticamente do Asaas.",
          })
          .eq("id", charge.id);
        if (error) throw new Error(error.message);
        const context = await loadPaymentContext(charge.receivable_id as string);
        const reference = context.receivable.internal_reference || context.receivable.description || "Título financeiro";
        await createPanelNotification({
          kind: "payment_overdue",
          title: "Cobrança Pix vencida",
          message: `${reference} venceu e foi removida automaticamente do Asaas.`,
          href: `/sistema/financeiro/contas-a-receber/${charge.receivable_id}`,
          entityId: charge.receivable_id as string,
          eventKey: `asaas:${eventId}:payment_overdue`,
        });
      }
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
        const context = await loadPaymentContext(charge.receivable_id as string);
        const reference = context.receivable.internal_reference || context.receivable.description || "Título financeiro";
        await createPanelNotification({
          kind: "payment_cancelled",
          title: "Cobrança Pix cancelada",
          message: `${reference} foi removida no Asaas.`,
          href: `/sistema/financeiro/contas-a-receber/${charge.receivable_id}`,
          entityId: charge.receivable_id as string,
          eventKey: `asaas:${eventId}:payment_deleted`,
        });
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
