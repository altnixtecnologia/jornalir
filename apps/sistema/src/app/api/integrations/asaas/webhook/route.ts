import "server-only";

import { randomUUID, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { resolveClientWhatsappRecipient, WHATSAPP_RECIPIENT_MESSAGES } from "@ir/core";
import { listReportExcludedReceivableIds } from "../../../../../providers/supabase/receivableReportExclusion.supabase";
import { getPaymentChargeService } from "../../../../../composition/financeiro";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../../../lib/supabase/admin";
import { notifyAltnixReceivableCommit } from "../../../../../lib/integrations/altnixReceivableEvent";
import { getAsaasWebhookToken } from "../../../../../lib/financeiro/asaasWebhookConfig";
import { canProcessAsaasWebhook } from "../../../../../lib/financeiro/asaasRuntimePolicy";
import { createAsaasPixProvider } from "../../../../../lib/financeiro/asaasPixProvider";
import { buildAsaasRefundAttention } from "../../../../../lib/financeiro/asaasRefundAttention";
import { buildAsaasChargebackAttention, isAsaasChargebackEvent } from "../../../../../lib/financeiro/asaasChargebackAttention";
import { cardWebhookPlan } from "../../../../../lib/financeiro/cardWebhookPolicy";
import { matchesStoredAsaasEvent } from "../../../../../lib/financeiro/asaasWebhookEventIdentity";
import { buildAsaasLatePaymentAttention, needsManualAsaasPaymentReconciliation } from "../../../../../lib/financeiro/asaasLatePaymentAttention";
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
  /** Identificador do parcelamento (cartão): pagamentos filhos compartilham o valor. */
  installment?: string;
  netValue?: number;
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
  kind: "payment_received" | "payment_cancelled" | "payment_overdue" | "whatsapp_failed" | "system";
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
    .select("id, full_name, company_name, trade_name, whatsapp")
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

  // Título de teste classificado: o aviso interno acima basta; nada é enviado ao cliente.
  if ((await listReportExcludedReceivableIds(admin)).includes(receivable.id)) return;

  // WhatsApp canônico; só cai para o telefone principal se não houver WhatsApp e for celular válido.
  const recipient = resolveClientWhatsappRecipient({ whatsapp: client.whatsapp });
  const toPhone = recipient.ok ? recipient.e164 : "";
  if (!recipient.ok) {
    await createPanelNotification({
      kind: "whatsapp_failed",
      title: "WhatsApp de confirmação não enviado",
      message: `${clientName}: ${WHATSAPP_RECIPIENT_MESSAGES[recipient.reason]} (pagamento de ${amountLabel}).`,
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

/**
 * Quando um PAYMENT_RECEIVED chega para cobrança já cancelada, expirada
 * ou com falha, não forçar a RPC nem deixar o Asaas reprocessando
 * indefinidamente. Aviso único por cobrança, evento registrado para
 * auditoria e tratamento humano. Falha ao criar o aviso devolve 500
 * e permite nova entrega idempotente, sem baixa automática.
 */
async function flagLatePaymentForManualReview(input: {
  eventId: string;
  processingToken: string;
  chargeId: string;
  receivableId: string;
}): Promise<Response> {
  await createPanelNotification(buildAsaasLatePaymentAttention(input.chargeId, input.receivableId));
  await markEvent(input.eventId, input.processingToken, {
    processed_at: new Date().toISOString(),
    error_message: "PAYMENT_RECEIVED chegou após encerramento local da cobrança; conciliação manual pendente.",
  });
  return NextResponse.json({ ok: true, manualReconciliation: true });
}

export async function POST(request: Request): Promise<Response> {
  // Um endpoint Preview não é destino legítimo de webhooks reais e não
  // deve modificar cobranças/recebimentos, mesmo com token válido.
  if(!canProcessAsaasWebhook({
    vercelEnv: process.env.VERCEL_ENV,
    asaasEnvironment: process.env.ASAAS_ENV,
    homologationEnabled: process.env.IR_HOMOLOGATION_ENABLED,
    homologationProjectRef: process.env.IR_HOMOLOGATION_SUPABASE_REF,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }))
    return NextResponse.json({error:"Webhook indisponível neste ambiente."},{status:404});
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

  // Evento é um registro de auditoria IMUTÁVEL. Um reenvio pode ter o
  // mesmo ID, nunca outro tipo ou outra cobrança. Não modificar payload,
  // identidade nem erro anterior ANTES de obter o lease exclusivo.
  const { data: previous, error: previousError } = await admin
    .from("billing_webhook_events")
    .select("id, processed_at, provider, event_type, provider_charge_id")
    .eq("id", eventId)
    .maybeSingle();

  if (previousError) {
    return NextResponse.json({ error: "Falha ao consultar idempotência." }, { status: 500 });
  }

  if (previous && !matchesStoredAsaasEvent(previous, { eventType, providerChargeId })) {
    // Mesmo ID não pode alterar o significado de evento já processado
    // ou em espera. 409 deixa explícito o conflito sem nenhum efeito.
    return NextResponse.json({ error: "Identificação de evento Asaas divergente." }, { status: 409 });
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

    if (insertError?.code === "23505") {
      // Outra entrega pode ter inserido o ID entre nosso SELECT e INSERT.
      // Revalidar a identidade persistida; não presumir mesmo conteúdo.
      const { data: concurrentlyInserted, error: concurrentError } = await admin
        .from("billing_webhook_events")
        .select("id, processed_at, provider, event_type, provider_charge_id")
        .eq("id", eventId)
        .single();
      if (concurrentError || !concurrentlyInserted) {
        return NextResponse.json({ error: "Falha ao validar evento concorrente." }, { status: 500 });
      }
      if (!matchesStoredAsaasEvent(concurrentlyInserted, { eventType, providerChargeId })) {
        return NextResponse.json({ error: "Identificação de evento Asaas divergente." }, { status: 409 });
      }
      if (concurrentlyInserted.processed_at) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
    } else if (insertError) {
      return NextResponse.json({ error: "Falha ao registrar evento." }, { status: 500 });
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

    const CHARGE_COLUMNS = "id, receivable_id, status, receipt_id, amount, payment_method, provider_confirmed_at, provider_rejected_at";
    const { data: chargeById, error: chargeError } = await admin
      .from("payment_charges")
      .select(CHARGE_COLUMNS)
      .eq("provider", "asaas")
      .eq("provider_charge_id", providerChargeId)
      .maybeSingle();

    if (chargeError) throw new Error(chargeError.message);

    // Parcelamento no cartão: o Asaas gera um pagamento por parcela. A cobrança local é UMA (a 1ª parcela);
    // eventos das parcelas filhas só são auditoria, nunca baixa, recibo ou aviso duplicados.
    let charge = chargeById;
    let childInstallment = false;
    if (!charge && typeof payload.payment?.installment === "string" && payload.payment.installment) {
      const { data: parent, error: parentError } = await admin
        .from("payment_charges")
        .select(CHARGE_COLUMNS)
        .eq("provider", "asaas")
        .eq("provider_installment_id", payload.payment.installment)
        .maybeSingle();
      if (parentError) throw new Error(parentError.message);
      if (parent) { charge = parent; childInstallment = true; }
    }
    if (charge && childInstallment) {
      if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_PARTIALLY_REFUNDED" || isAsaasChargebackEvent(eventType)) {
        const attention = isAsaasChargebackEvent(eventType)
          ? buildAsaasChargebackAttention(eventType, eventId, charge.receivable_id as string)
          : buildAsaasRefundAttention(eventType as "PAYMENT_REFUNDED" | "PAYMENT_PARTIALLY_REFUNDED", eventId, charge.receivable_id as string);
        await createPanelNotification(attention);
        await markEvent(eventId, processingToken, { processed_at: new Date().toISOString(), error_message: "Evento de parcela do cartão comunicado no painel; conciliação manual pendente." });
        return NextResponse.json({ ok: true, manualReconciliation: true });
      }
      await markEvent(eventId, processingToken, { processed_at: new Date().toISOString(), error_message: "Evento de parcela filha do cartão: sem efeito financeiro (cobrança única)." });
      return NextResponse.json({ ok: true, ignored: true });
    }
    const isCard = charge?.payment_method === "credit_card";
    // Modelo contábil: o recibo (baixa) do cartão é gerado na CONFIRMAÇÃO (pagamento efetuado, saldo ainda não
    // disponível) e a liquidação (PAYMENT_RECEIVED, ~32 dias) só registra data e valor líquido, sem novo recibo.
    // ASAAS_CARD_RECEIPT_ON_RECEIVED=true mantém a baixa só na liquidação (modelo estrito).
    const plan = cardWebhookPlan({
      eventType, isCard, chargeStatus: String(charge?.status ?? ""),
      strictSettlement: process.env.ASAAS_CARD_RECEIPT_ON_RECEIVED === "true",
    });

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

    // Marcos do cartão (auditoria durável, uma gravação por marco; nunca altera saldo).
    if (plan.markConfirmed) {
      const now = new Date().toISOString();
      const milestones: Record<string, unknown> = { provider_rejected_at: null };
      if (!charge.provider_confirmed_at) milestones.provider_confirmed_at = now;
      if (plan.markSettled) {
        milestones.provider_settled_at = now;
        if (typeof payload.payment?.netValue === "number" && Number.isFinite(payload.payment.netValue)) milestones.gateway_net_amount = payload.payment.netValue;
      }
      const { error: milestoneError } = await admin.from("payment_charges").update(milestones).eq("id", charge.id);
      if (milestoneError) throw new Error(milestoneError.message);
    }
    if (plan.settlementOnly) {
      // Liquidação de cartão já baixado na confirmação: só os marcos acima; nada de novo recibo nem aviso.
      await markEvent(eventId, processingToken, { processed_at: new Date().toISOString(), error_message: null });
      return NextResponse.json({ ok: true, settled: true });
    }
    if (plan.markRejected) {
      // Recusa: a cobrança segue pendente (nova tentativa na mesma fatura ou troca de forma); só registra o estado.
      const { error: refusedError } = await admin.from("payment_charges")
        .update({ provider_rejected_at: new Date().toISOString() })
        .eq("id", charge.id).eq("status", "pending").is("provider_confirmed_at", null);
      if (refusedError) throw new Error(refusedError.message);
    }

    if (plan.settle) {
      if (needsManualAsaasPaymentReconciliation(charge.status as string)) {
        return flagLatePaymentForManualReview({
          eventId, processingToken,
          chargeId: charge.id as string,
          receivableId: charge.receivable_id as string,
        });
      }

      try {
        await getPaymentChargeService(admin).confirmPixCharge(
          charge.id as string,
          receivedDate(payload.payment),
          undefined,
        );
      } catch (confirmationError) {
        // Um PAYMENT_DELETED/OVERDUE pode vencer a corrida entre a leitura
        // inicial e o lock de confirm_payment_charge. Consultar de novo:
        // só um estado encerrado autoriza enviar para revisão manual.
        // Erros de banco/infra continuam falhando e são reprocessáveis.
        const { data: latest, error: latestError } = await admin
          .from("payment_charges")
          .select("status")
          .eq("id", charge.id)
          .maybeSingle();
        if (!latestError && latest && needsManualAsaasPaymentReconciliation(latest.status as string)) {
          return flagLatePaymentForManualReview({
            eventId, processingToken,
            chargeId: charge.id as string,
            receivableId: charge.receivable_id as string,
          });
        }
        throw confirmationError;
      }

      // Só após confirmar baixa local; estorno do provedor continua em revisão manual.
      await notifyAltnixReceivableCommit([charge.receivable_id as string]);
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
        const { data: cancelled, error } = await admin
          .from("payment_charges")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "Cobrança vencida; removida automaticamente do Asaas.",
          })
          .eq("id", charge.id).eq("status", "pending")
          .select("id").maybeSingle();
        if (error) throw new Error(error.message);
        if (!cancelled) {
          // Pagamento webhook ganhou a corrida: jamais registrar cancelamento.
          await markEvent(eventId, processingToken, {
            processed_at: new Date().toISOString(),
            error_message: "Cancelamento ignorado: cobrança já mudou de status durante o processamento.",
          });
          return NextResponse.json({ ok: true, ignored: true });
        }
        const context = await loadPaymentContext(charge.receivable_id as string);
        const reference = context.receivable.internal_reference || context.receivable.description || "Título financeiro";
        await createPanelNotification({
          kind: "payment_overdue",
          title: isCard ? "Cobrança de cartão vencida" : "Cobrança Pix vencida",
          message: `${reference} venceu e foi removida automaticamente do Asaas.`,
          href: `/sistema/financeiro/contas-a-receber/${charge.receivable_id}`,
          entityId: charge.receivable_id as string,
          eventKey: `asaas:${eventId}:payment_overdue`,
        });
      }
    } else if (eventType === "PAYMENT_DELETED") {
      if (charge.status === "pending") {
        const { data: cancelled, error } = await admin
          .from("payment_charges")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "Cobrança removida no Asaas.",
          })
          .eq("id", charge.id).eq("status", "pending")
          .select("id").maybeSingle();
        if (error) throw new Error(error.message);
        if (!cancelled) {
          await markEvent(eventId, processingToken, {
            processed_at: new Date().toISOString(),
            error_message: "Exclusão ignorada: pagamento/status modificado antes da atualização.",
          });
          return NextResponse.json({ ok: true, ignored: true });
        }
        const context = await loadPaymentContext(charge.receivable_id as string);
        const reference = context.receivable.internal_reference || context.receivable.description || "Título financeiro";
        await createPanelNotification({
          kind: "payment_cancelled",
          title: isCard ? "Cobrança de cartão cancelada" : "Cobrança Pix cancelada",
          message: `${reference} foi removida no Asaas.`,
          href: `/sistema/financeiro/contas-a-receber/${charge.receivable_id}`,
          entityId: charge.receivable_id as string,
          eventKey: `asaas:${eventId}:payment_deleted`,
        });
      }
    } else if (isAsaasChargebackEvent(eventType)) {
      // Chargeback: nunca estorna recibo, altera saldo ou serviço automaticamente (conciliação humana).
      await createPanelNotification(buildAsaasChargebackAttention(eventType, eventId, charge.receivable_id as string));
      await markEvent(eventId, processingToken, {
        processed_at: new Date().toISOString(),
        error_message: "Chargeback comunicado no painel; conciliação financeira manual pendente.",
      });
      return NextResponse.json({ ok: true, manualReconciliation: true });
    } else if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_PARTIALLY_REFUNDED") {
      // O Asaas pode estornar valores totais/parciais após a baixa local.
      // Nunca alterar status, saldos, recibos ou créditos automaticamente.
      // Primeiro reservar aviso por evento (UNIQUE event_key), DEPOIS marcar
      // como processado: falha permite reenvio sem duplicar a notificação.
      const attention = buildAsaasRefundAttention(eventType, eventId, charge.receivable_id as string);
      await createPanelNotification(attention);
      await markEvent(eventId, processingToken, {
        processed_at: new Date().toISOString(),
        error_message: "Estorno comunicado no painel; conciliação financeira manual pendente.",
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
