import "server-only";

import { randomUUID, timingSafeEqual } from "crypto";
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
  processingToken: string,
  values: { processed_at?: string | null; error_message?: string | null },
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("billing_webhook_events")
    .update({ ...values, processing_token: null, processing_at: null })
    .eq("id", eventId).eq("processing_token", processingToken)
    .select("id").maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Evento assumido por outro processador; resultado não atualizado.");
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function paymentMethodLabel(payment: AsaasWebhookPayment | undefined): string {
  const billingType = (payment?.billingType ?? "").trim().toUpperCase();
  if (billingType === "PIX") return "PIX";
  if (billingType === "CREDIT_CARD") return "Cartão de crédito";
  if (billingType === "DEBIT_CARD") return "Cartão de débito";
  if (billingType === "BOLETO") return "Boleto";
  if (billingType === "TRANSFER") return "Transferência bancária";
  return billingType || "Não informado";
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
  chargeId: string;
  receivableId: string;
  amount: number;
  paymentMethodLabel: string;
  providerTransactionId: string;
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
    eventKey: `asaas:charge:${input.chargeId}:payment_received`,
  });

  const toPhone = client.whatsapp || client.phone_primary || "";
  if (!toPhone) {
    await createPanelNotification({
      kind: "whatsapp_failed",
      title: "WhatsApp de confirmação não enviado",
      message: `${clientName} não possui WhatsApp/telefone cadastrado para confirmar o pagamento de ${amountLabel}.`,
      href,
      entityId: receivable.id,
      eventKey: `asaas:charge:${input.chargeId}:whatsapp_no_phone`,
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
      eventKey: `asaas:charge:${input.chargeId}:whatsapp_not_configured`,
    });
    return;
  }

  // Reserva durável ANTES do envio à Meta. O índice único por cobrança
  // impede reenvios em webhooks diferentes, simultâneos ou após crash.
  // Se a Meta responder timeout depois de enviar, NÃO repetimos
  // automaticamente: a situação permanece incerta para conciliação.
  const { data: dispatch, error: claimError } = await admin
    .from("billing_notification_dispatches")
    .upsert({
      payment_charge_id: input.chargeId,
      notification_kind: "payment_confirmed",
      receivable_id: receivable.id,
      client_id: client.id,
      to_phone: toPhone,
      status: "sending",
    }, { onConflict: "payment_charge_id,notification_kind", ignoreDuplicates: true })
    .select("id").maybeSingle();
  if (claimError) throw new Error("Falha na reserva idempotente do WhatsApp: " + claimError.message);
  if (!dispatch) return; // Outra entrega já reservou esta confirmação.

  const message = `Pagamento confirmado: ${amountLabel} • ${reference} • ${input.paymentMethodLabel} • Transação ${input.providerTransactionId}`;
  let providerMessageId: string | null = null;
  let sendError: string | null = null;
  try {
    const sent = await sendWhatsappPaymentConfirmedTemplate({
      toPhone,
      clientName,
      reference,
      amountLabel,
      paymentMethodLabel: input.paymentMethodLabel,
      transactionId: input.providerTransactionId,
    });
    providerMessageId = sent.providerMessageId ?? null;
  } catch (error) {
    sendError = (error instanceof Error ? error.message : "Falha ao enviar confirmação pelo WhatsApp.").slice(0, 1000);
  }

  const { error: dispatchError } = await admin.from("billing_notification_dispatches")
    .update({
      status: sendError ? "uncertain" : "sent",
      provider_message_id: providerMessageId,
      error_message: sendError,
      finished_at: new Date().toISOString(),
    }).eq("id", dispatch.id);
  if (dispatchError) throw new Error("Envio reservado, mas falhou o registro do resultado: " + dispatchError.message);

  const { error: logError } = await admin.from("billing_message_logs").insert({
    receivable_id: receivable.id,
    client_id: client.id,
    channel: "whatsapp",
    to_phone: toPhone,
    message,
    status: sendError ? "failed" : "sent",
    provider_message_id: providerMessageId,
    error_message: sendError,
    created_by: null,
  });
  // Reserva sempre prevalece sobre log auxiliar: jamais reenviar só
  // porque um INSERT de auditoria falhou após a Meta aceitar a mensagem.
  if (sendError || logError) {
    await createPanelNotification({
      kind: "whatsapp_failed",
      title: sendError ? "Envio WhatsApp precisa de conciliação" : "Falha no log de envio WhatsApp",
      message: `${clientName} • ${amountLabel} • ${sendError ?? logError?.message ?? "Verifique o registro do envio."} (não reenviar automaticamente)`,
      href,
      entityId: receivable.id,
      eventKey: `asaas:charge:${input.chargeId}:whatsapp_reconcile`,
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

  // Claim atômico por evento: uma entrega concorrente não pode
  // processar duas vezes o mesmo evento enquanto a primeira está ativa.
  // Lease de 15 minutos cobre interrupção abrupta da função serverless.
  const processingToken = randomUUID();
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("billing_webhook_events")
    .update({ processing_token: processingToken, processing_at: new Date().toISOString() })
    .eq("id", eventId).is("processed_at", null)
    .or(`processing_token.is.null,processing_at.lt.${staleBefore}`)
    .select("id").maybeSingle();
  if (claimError) return NextResponse.json({ error: "Falha ao reservar evento." }, { status: 500 });
  if (!claimed) {
    const { data: current, error } = await admin.from("billing_webhook_events")
      .select("processed_at").eq("id", eventId).single();
    if (error) return NextResponse.json({ error: "Falha ao consultar evento." }, { status: 500 });
    return current?.processed_at
      ? NextResponse.json({ ok: true, duplicate: true })
      : NextResponse.json({ error: "Evento em processamento; reenviar depois." }, { status: 503 });
  }

  try {
    if (!providerChargeId) {
      await markEvent(eventId, processingToken, {
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
          await markEvent(eventId, processingToken, {
            processed_at: null,
            error_message: "Cobrança local ainda não persistida; aguardando reenvio do Asaas.",
          });
          return NextResponse.json({ error: "Cobrança local ainda não disponível." }, { status: 503 });
        }
      }

      // A mesma conta Asaas pode conter cobranças de outros sistemas.
      // Se não aponta para um título do JornalIR, reconhece com 200 para
      // não interromper a fila compartilhada do provedor.
      await markEvent(eventId, processingToken, {
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
        chargeId: charge.id as string,
        receivableId: charge.receivable_id as string,
        amount: Number(charge.amount ?? 0),
        paymentMethodLabel: paymentMethodLabel(payload.payment),
        providerTransactionId: providerChargeId,
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
      await markEvent(eventId, processingToken, {
        processed_at: new Date().toISOString(),
        error_message: "Estorno recebido do Asaas; requer conciliação no Financeiro.",
      });
      return NextResponse.json({ ok: true, manualReconciliation: true });
    }

    await markEvent(eventId, processingToken, { processed_at: new Date().toISOString(), error_message: null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar webhook.";
    try {
      await markEvent(eventId, processingToken, { error_message: message.slice(0, 1000), processed_at: null });
    } catch {
      // Mantém a resposta de erro original; o Asaas poderá reenviar o evento.
    }
    return NextResponse.json({ error: "Falha ao processar evento." }, { status: 500 });
  }
}
