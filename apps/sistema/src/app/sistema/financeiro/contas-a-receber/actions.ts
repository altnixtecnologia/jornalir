"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentMethod, AdjustmentType } from "@ir/types";
import type { ReceivableInput } from "@ir/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentChargeService, getReceivableService } from "../../../../composition/financeiro";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { validateChargeReceivableLink } from "../../../../lib/financeiro/commercialSaleBillingGuard";
import { todayInSaoPauloISO } from "../../../../lib/date/saoPauloDate";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { isLocalPreviewEnabled, LOCAL_PREVIEW_PROFILE } from "../../../../lib/auth/localPreview";
import { buildBillingMessage } from "@ir/core";
import { parseAmount, validateReceivablePayload, type ReceivableFormPayload } from "../../../../features/financeiro/receivableFormTypes";
import { createBillingMessageLogRepositorySupabase } from "../../../../providers/supabase/billingMessageLogRepository.supabase";
import {
  sendWhatsappBillingTemplate,
  sendWhatsappPaymentConfirmedTemplate,
} from "../../../../lib/financeiro/whatsappCloudProvider";
import { provisionAsaasWebhookAction } from "../../configuracoes/cobrancas/actions";

const LIST_PATH = "/sistema/financeiro/contas-a-receber";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

/** Mesmo princípio de getAuditContext, mas também funciona em preview (onde não existe sessão real do Supabase) — usado só pelas ações novas desta fase (Pix/WhatsApp). */
async function resolveActorId(client: SupabaseClient): Promise<string> {
  if (isLocalPreviewEnabled()) return LOCAL_PREVIEW_PROFILE.id;
  return (await getAuditContext(client)).actorId;
}

function toServiceInput(payload: ReceivableFormPayload): ReceivableInput {
  return {
    clientId: payload.clientId,
    description: payload.description,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId || undefined,
    sourceReference: payload.sourceReference || undefined,
    subscriptionId: payload.subscriptionId || undefined,
    contractId: payload.contractId || undefined,
    originalAmount: parseAmount(payload.originalAmount),
    issueDate: payload.issueDate,
    dueDate: payload.dueDate,
    competencyDate: payload.competencyDate || undefined,
    notes: payload.notes,
  };
}

export async function createReceivable(payload: ReceivableFormPayload): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("titulos_criar");
  if (permissionError) return { error: permissionError };
  const validationError = validateReceivablePayload(payload);
  if (validationError) return { error: validationError };

  let receivableId: string;
  try {
    const receivable = await getReceivableService(createSupabaseServerClient()).register(toServiceInput(payload));
    receivableId = receivable.id;
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${receivableId}`);
}

export async function updateReceivable(id: string, payload: ReceivableFormPayload): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("titulos_editar");
  if (permissionError) return { error: permissionError };
  const validationError = validateReceivablePayload(payload);
  if (validationError) return { error: validationError };

  try {
    await getReceivableService(createSupabaseServerClient()).update(id, toServiceInput(payload));
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  redirect(`${LIST_PATH}/${id}`);
}

export async function cancelReceivableAction(id: string): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("titulos_cancelar");
  if (permissionError) return { error: permissionError };
  try {
    await getReceivableService(createSupabaseServerClient()).cancel(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(LIST_PATH);
}

export async function reopenReceivableAction(id: string): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("titulos_reabrir");
  if (permissionError) return { error: permissionError };
  try {
    await getReceivableService(createSupabaseServerClient()).reopen(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(LIST_PATH);
}

export interface ReceiptFormInput {
  amount: string;
  receivedAt: string;
  paymentMethod: PaymentMethod | "";
  reference: string;
  notes: string;
  receivedByProfileId: string;
  operationId?: string;
}

async function recordManualPaymentAtomically(
  receivableId: string, input: ReceiptFormInput, mode: "receipt" | "settlement",
  reason?: string, authorizedByProfileId?: string
): Promise<void> {
  if (!input.operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operationId))
    throw new Error("Identificador da operação ausente. Reabra o formulário.");
  const db = createSupabaseServerClient();
  const { error } = await db.rpc("record_manual_receivable_payment", {
    p_operation_id: input.operationId, p_receivable_id: receivableId,
    p_amount: parseAmount(input.amount), p_received_at: input.receivedAt,
    p_payment_method: input.paymentMethod || null,
    p_reference: input.reference || null, p_notes: input.notes || null,
    p_received_by: input.receivedByProfileId || null, p_mode: mode,
    p_reason: reason || null, p_authorized_by: authorizedByProfileId || null,
  });
  if (error) throw new Error(error.message);
}

export async function addReceiptAction(receivableId: string, input: ReceiptFormInput): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("recebimentos_baixar");
  if (permissionError) return { error: permissionError };
  try {
    if (isLocalPreviewEnabled()) {
    await getReceivableService(createSupabaseServerClient()).addReceipt(receivableId, {
      amount: parseAmount(input.amount),
      receivedAt: input.receivedAt,
      paymentMethod: input.paymentMethod || undefined,
      reference: input.reference,
      notes: input.notes,
      receivedByProfileId: input.receivedByProfileId || undefined,
    });
    } else {
      await recordManualPaymentAtomically(receivableId, input, "receipt");
    }
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  revalidatePath(LIST_PATH);
}

export interface SettleWithDifferenceFormInput extends ReceiptFormInput {
  reason: string;
  authorizedByProfileId: string;
}

export async function settleWithDifferenceAction(receivableId: string, input: SettleWithDifferenceFormInput): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("recebimentos_quitar_diferenca");
  if (permissionError) return { error: permissionError };
  try {
    if (isLocalPreviewEnabled()) {
    await getReceivableService(createSupabaseServerClient()).settleWithDifference(receivableId, {
      receivedAmount: parseAmount(input.amount),
      receivedAt: input.receivedAt,
      paymentMethod: input.paymentMethod || undefined,
      reference: input.reference,
      notes: input.notes,
      receivedByProfileId: input.receivedByProfileId || undefined,
      reason: input.reason,
      authorizedByProfileId: input.authorizedByProfileId || undefined,
    });
    } else {
      await recordManualPaymentAtomically(receivableId, input, "settlement", input.reason, input.authorizedByProfileId);
    }
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  revalidatePath(LIST_PATH);
}

export interface AdjustmentFormInput {
  amount: string;
  adjustmentType: AdjustmentType;
  reason: string;
  authorizedByProfileId: string;
  notes: string;
}

export async function addAdjustmentAction(receivableId: string, input: AdjustmentFormInput): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("ajustes_criar");
  if (permissionError) return { error: permissionError };
  try {
    await getReceivableService(createSupabaseServerClient()).addAdjustment(receivableId, {
      amount: parseAmount(input.amount),
      adjustmentType: input.adjustmentType,
      reason: input.reason,
      authorizedByProfileId: input.authorizedByProfileId || undefined,
      notes: input.notes,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  revalidatePath(LIST_PATH);
}

export interface CompositionPaymentFormInput {
  amount: string;
  receivedAt: string;
  paymentMethod: PaymentMethod | "";
  reference: string;
  notes: string;
  receivedByProfileId: string;
}

/**
 * Pagamento pela COMPOSIÇÃO (Parte 3B.1, ajuste de integridade item 2)
 * — `receivableIdsOldestFirst` já vem pronto da tela (saldo(s) anterior
 * em aberto + o título atual, nessa ordem). Esta é a ação PADRÃO pra
 * quem está pagando a composição inteira: sempre quita o mais antigo
 * primeiro (ver ReceivableService.payAcrossReceivables), nunca deixa o
 * operador escolher por engano aplicar tudo só no título mais novo. O
 * lançamento manual específico num único título continua existindo
 * (addReceiptAction), mas é uma ação separada e consciente.
 */
export async function payCompositionAction(receivableIdsOldestFirst: string[], input: CompositionPaymentFormInput): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("recebimentos_baixar");
  if (permissionError) return { error: permissionError };
  try {
    await getReceivableService(createSupabaseServerClient()).payAcrossReceivables(receivableIdsOldestFirst, {
      amount: parseAmount(input.amount),
      receivedAt: input.receivedAt,
      paymentMethod: input.paymentMethod || undefined,
      reference: input.reference,
      notes: input.notes,
      receivedByProfileId: input.receivedByProfileId || undefined,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  for (const id of receivableIdsOldestFirst) revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(LIST_PATH);
}

/**
 * Aplicação MANUAL de crédito de outra origem (Parte 3B.1, item 4) —
 * mesmo mecanismo da aplicação automática (ReceivableAdjustment
 * credit_applied), só que explícita e podendo cruzar origens
 * diferentes (a automática nunca cruza).
 */
export async function applyCreditManuallyAction(receivableId: string, creditId: string, amount: number): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("creditos_aplicar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getReceivableService(client).applyCreditManually(receivableId, creditId, amount, AUDIT.actorId);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  revalidatePath(LIST_PATH);
}

export async function reverseReceiptAction(receivableId: string, receiptId: string, reason: string): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("recebimentos_estornar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getReceivableService(client).reverseReceipt(receivableId, receiptId, AUDIT.actorId, reason);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  revalidatePath(LIST_PATH);
}

export async function reverseAdjustmentAction(receivableId: string, adjustmentId: string, reason: string): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("ajustes_estornar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getReceivableService(client).reverseAdjustment(receivableId, adjustmentId, AUDIT.actorId, reason);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  revalidatePath(LIST_PATH);
}

/**
 * Geração manual de UMA cobrança a partir de Assinatura (Parte 3B, item
 * 2) — o payload já vem da tela de revisão (sourceType=subscription,
 * subscriptionId preenchido), podendo ter sido editado pelo usuário
 * antes de confirmar. Nunca grava duplicado pra mesma competência —
 * ver ReceivableService.registerFromSubscription.
 */
export async function generateReceivableFromSubscriptionAction(
  payload: ReceivableFormPayload,
): Promise<{ error: string } | { ok: true; receivableId: string }> {
  const permissionError = await checkFinanceAction("titulos_criar");
  if (permissionError) return { error: permissionError };
  const validationError = validateReceivablePayload(payload);
  if (validationError) return { error: validationError };
  try {
    const receivable = await getReceivableService(createSupabaseServerClient()).registerFromSubscription(toServiceInput(payload));
    revalidatePath(LIST_PATH);
    return { ok: true, receivableId: receivable.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export interface BatchGenerationItemResult {
  competencyDate: string;
  ok: boolean;
  error?: string;
}

/**
 * Geração de PERÍODO (item 4b) — nunca silenciosa: cada item da prévia
 * (já revisado/editado/desmarcado pelo usuário) é tentado
 * individualmente, e o resultado completo (sucesso ou motivo da falha,
 * ex.: duplicidade de competência) é devolvido pra UI mostrar exatamente
 * o que foi criado e o que não foi. Sem transação real (cada
 * registerFromSubscription já é atômico por título; um item falhar
 * nunca desfaz os anteriores, de propósito — o usuário vê e decide).
 */
export async function generateReceivablesForSubscriptionPeriodAction(
  payloads: ReceivableFormPayload[],
): Promise<{ results: BatchGenerationItemResult[] }> {
  const permissionError = await checkFinanceAction("titulos_criar");
  if (permissionError) return { results: payloads.map((payload) => ({ competencyDate: payload.competencyDate, ok: false, error: permissionError })) };
  const client = createSupabaseServerClient();
  const service = getReceivableService(client);
  const results: BatchGenerationItemResult[] = [];

  for (const payload of payloads) {
    const validationError = validateReceivablePayload(payload);
    if (validationError) {
      results.push({ competencyDate: payload.competencyDate, ok: false, error: validationError });
      continue;
    }
    try {
      await service.registerFromSubscription(toServiceInput(payload));
      results.push({ competencyDate: payload.competencyDate, ok: true });
    } catch (error) {
      results.push({ competencyDate: payload.competencyDate, ok: false, error: toErrorMessage(error) });
    }
  }

  revalidatePath(LIST_PATH);
  return { results };
}

// ----------------------------------------------------------------------
// Cobrança Pix (fase "Formas de liquidação/Pix/envio ao cliente") — nunca
// cria um ReceivableReceipt direto: só uma cobrança PENDENTE, até uma
// confirmação futura (ver PaymentChargeService.confirmPixCharge, ainda
// não acionada por nenhum webhook real nesta fase).
// ----------------------------------------------------------------------

export interface PixChargeFormInput {
  amount: string;
  description: string;
  expiresAt: string;
}

export async function createPixChargeAction(
  receivableId: string,
  clientId: string,
  input: PixChargeFormInput,
): Promise<{ error: string } | { ok: true }> {
  const permissionError = await checkFinanceAction("pix_gerar");
  if (permissionError) return { error: permissionError };
  const amount = parseAmount(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Informe um valor válido para a cobrança." };
  if (amount < 5) return { error: "O Asaas exige cobrança Pix mínima de R$ 5,00." };
  if (input.expiresAt && (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)
    || !Number.isFinite(Date.parse(input.expiresAt + "T12:00:00-03:00"))
    || input.expiresAt < todayInSaoPauloISO())) {
    return { error: "A data de vencimento do Pix não pode ser anterior a hoje." };
  }
  try {
    const client = createSupabaseServerClient();
    // Os IDs enviados pelo navegador não são fonte da verdade.
    const title = await getReceivableService(client).getById(receivableId);
    if (title.clientId !== clientId) return { error: "Cliente não corresponde ao título selecionado." };
    if (title.status === "cancelled" || title.balance <= 0) {
      return { error: "Este título não possui saldo aberto para gerar uma cobrança." };
    }
    if (Math.round(amount * 100) > Math.round(title.balance * 100)) {
      return { error: "A cobrança Pix não pode ser maior que o saldo aberto do título." };
    }

    const { data: billingSettings, error: billingSettingsError } = await client
      .from("billing_provider_settings")
      .select("environment")
      .eq("id", 1)
      .single();
    if (billingSettingsError) throw new Error(billingSettingsError.message);

    const webhook = await provisionAsaasWebhookAction(
      billingSettings.environment as "sandbox" | "production",
    );
    if ("error" in webhook) {
      return {
        error:
          "Não foi possível garantir o webhook do Asaas antes de criar a cobrança: " +
          webhook.error,
      };
    }

    await getPaymentChargeService(client).createPixCharge({
      receivableId,
      clientId,
      amount,
      description: input.description.trim() || undefined,
      expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T23:59:59-03:00`).toISOString() : undefined,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  return { ok: true };
}

export async function reconcilePixReservationAction(chargeId: string, receivableId: string): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("pix_gerar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const charges = getPaymentChargeService(client);
    const [charge, receivable] = await Promise.all([
      charges.getById(chargeId), getReceivableService(client).getById(receivableId),
    ]);
    const mismatch = validateChargeReceivableLink(charge, receivable);
    if (mismatch) return { error: mismatch };
    await charges.reconcilePixReservation(chargeId);
    revalidatePath(`${LIST_PATH}/${receivableId}`);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function cancelPixChargeAction(chargeId: string, receivableId: string, reason: string): Promise<ActionResult> {
  const permissionError = await checkFinanceAction("pix_cancelar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const charges=getPaymentChargeService(client);
    // O navegador informa os dois IDs; conferi-los com os registros reais
    // antes de chamar DELETE no Asaas. Nunca cancelar cobrança de outro título.
    const [charge,receivable]=await Promise.all([
      charges.getById(chargeId),getReceivableService(client).getById(receivableId),
    ]);
    const mismatch=validateChargeReceivableLink(charge,receivable);
    if(mismatch) return {error:mismatch};
    if(!reason.trim() || reason.trim().length<8)
      return {error:"Informe um motivo de cancelamento com pelo menos 8 caracteres."};
    const cancelledByProfileId = await resolveActorId(client);
    await charges.cancelPixCharge(chargeId, { cancelledByProfileId, cancellationReason: reason.trim() });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
}

/**
 * Ação de confirmação exclusivamente LOCAL. Em produção, o webhook
 * Asaas autenticado usa a RPC com service_role, nunca esta Server Action.
 */
export async function confirmPixChargeAction(
  chargeId: string,
  receivableId: string,
): Promise<{ error: string } | { ok: true; overpaymentAmount: number }> {
  // A função existe apenas para simulação de apresentação. A confirmação
  // real vem EXCLUSIVAMENTE do webhook validado, via service_role,
  // e de sua RPC transacional. Uma chamada fabricada à Server Action
  // jamais deve confirmar pagamento financeiro real.
  if(!isLocalPreviewEnabled())
    return {error:"Confirmação de Pix é automática pelo Asaas; esta ação só existe na demonstração local."};
  const permissionError = await checkFinanceAction("recebimentos_baixar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const charges=getPaymentChargeService(client);
    const [charge,receivable]=await Promise.all([
      charges.getById(chargeId),getReceivableService(client).getById(receivableId),
    ]);
    const mismatch=validateChargeReceivableLink(charge,receivable);
    if(mismatch) return {error:mismatch};
    const receivedByProfileId = await resolveActorId(client);
    const result = await charges.confirmPixCharge(chargeId, new Date().toISOString().slice(0, 10), receivedByProfileId);
    revalidatePath(`${LIST_PATH}/${receivableId}`);
    return { ok: true, overpaymentAmount: result.overpaymentAmount };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

// ----------------------------------------------------------------------
// Envio de cobrança ao cliente (WhatsApp) — nunca chama nenhuma API real
// nesta fase; em preview só simula, fora do preview recusa honestamente
// sem provedor configurado (ver BillingMessageService).
// ----------------------------------------------------------------------

export async function sendBillingMessageAction(
  receivableId: string,
  clientId: string,
  message: string,
): Promise<{ error: string } | { ok: true; status: "sent" | "simulated" }> {
  const permissionError = await checkFinanceAction("pix_enviar");
  if (permissionError) return { error: permissionError };
  const client = createSupabaseServerClient();
  let toPhone = "";
  let createdByProfileId: string | undefined;

  try {
    const [clientRecord, receivable, charges, actorId] = await Promise.all([
      getClientService(client).getById(clientId),
      getReceivableService(client).getById(receivableId),
      getPaymentChargeService(client).listForReceivable(receivableId),
      resolveActorId(client),
    ]);
    createdByProfileId = actorId;
    if (receivable.clientId !== clientRecord.id) {
      return { error: "O cliente informado não corresponde à cobrança selecionada." };
    }
    toPhone = clientRecord.whatsapp ?? clientRecord.phonePrimary ?? "";
    if (!toPhone) return { error: "Cadastro sem WhatsApp." };

    const pendingCharge = charges.find((charge) => charge.status === "pending");
    if (pendingCharge?.provider === "asaas" && !pendingCharge.providerChargeId)
      return { error: "Criação Pix pendente de conciliação no Asaas; envio bloqueado." };
    if (!pendingCharge?.publicToken) {
      return { error: "Gere uma cobrança Pix antes de enviar ao cliente." };
    }

    const paymentUrl = `https://controle.altnix.com.br/pagamento/${pendingCharge.publicToken}`;
    const clientName = (clientRecord.tradeName ?? clientRecord.fullName ?? clientRecord.companyName ?? "Cliente").split(" ")[0];
    const amountLabel = pendingCharge.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const dueDateLabel = new Date(`${receivable.dueDate}T12:00:00`).toLocaleDateString("pt-BR");

    const sent = await sendWhatsappBillingTemplate({
      toPhone,
      clientName,
      reference: receivable.description || receivable.reference,
      amountLabel,
      dueDateLabel,
      paymentUrl,
    });

    await createBillingMessageLogRepositorySupabase(client).create({
      receivableId,
      clientId,
      channel: "whatsapp",
      toPhone,
      message,
      status: "sent",
      providerMessageId: sent.providerMessageId,
      createdByProfileId,
    });

    revalidatePath(`${LIST_PATH}/${receivableId}`);
    return { ok: true, status: "sent" };
  } catch (error) {
    if (toPhone) {
      try {
        await createBillingMessageLogRepositorySupabase(client).create({
          receivableId,
          clientId,
          channel: "whatsapp",
          toPhone,
          message,
          status: "failed",
          errorMessage: toErrorMessage(error),
          createdByProfileId,
        });
      } catch {
        // Falha de log nunca deve esconder o erro real do provedor.
      }
    }
    return { error: toErrorMessage(error) };
  }
}

/** Compõe a prévia da mensagem (nunca envia) — usada pelo modal "Enviar ao cliente" antes de confirmar. */
export async function buildBillingMessagePreviewAction(
  receivableId: string,
): Promise<
  | { error: string }
  | {
      ok: true;
      message: string;
      hasWhatsapp: boolean;
      whatsappHref?: string;
      pixCopyPaste?: string;
      paymentUrl?: string;
    }
> {
  const permissionError = await checkFinanceAction("pix_enviar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const receivable = await getReceivableService(client).getById(receivableId);
    const [clientRecord, charges] = await Promise.all([
      getClientService(client).getById(receivable.clientId),
      getPaymentChargeService(client).listForReceivable(receivableId),
    ]);
    const pendingCharge = charges.find((charge) => charge.status === "pending");
    if (pendingCharge?.provider === "asaas" && !pendingCharge.providerChargeId)
      return { error: "Aguarde a conciliação da cobrança Pix com o Asaas." };
    const paymentUrl = pendingCharge?.publicToken
      ? `https://controle.altnix.com.br/pagamento/${pendingCharge.publicToken}`
      : undefined;
    const baseMessage = buildBillingMessage({
      clientFirstName: (clientRecord.fullName ?? clientRecord.companyName ?? "Cliente").split(" ")[0],
      receivable: { sourceType: receivable.sourceType, description: receivable.description, dueDate: receivable.dueDate },
      amount: pendingCharge?.amount ?? receivable.balance,
    });
    const message = paymentUrl
      ? `${baseMessage}\n\nQR Code e Pix Copia e Cola:\n${paymentUrl}`
      : baseMessage;
    const phone = (clientRecord.whatsapp ?? clientRecord.phonePrimary ?? "").replace(/\D/g, "");
    const normalizedPhone = phone && !phone.startsWith("55") ? `55${phone}` : phone;
    const whatsappHref = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : undefined;

    return {
      ok: true,
      message,
      hasWhatsapp: Boolean(normalizedPhone),
      whatsappHref,
      pixCopyPaste: pendingCharge?.pixCopyPaste,
      paymentUrl,
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function buildPaymentConfirmationPreviewAction(
  receivableId: string,
): Promise<
  | { error: string }
  | {
      ok: true;
      message: string;
      hasWhatsapp: boolean;
      whatsappHref?: string;
    }
> {
  const permissionError = await checkFinanceAction("pix_enviar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const receivable = await getReceivableService(client).getById(receivableId);
    const [clientRecord, charges] = await Promise.all([
      getClientService(client).getById(receivable.clientId),
      getPaymentChargeService(client).listForReceivable(receivableId),
    ]);
    const paidCharge = charges
      .filter((charge) => charge.status === "paid")
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
    if (!paidCharge) return { error: "Nenhuma cobrança Pix paga encontrada neste título." };

    const clientName = (clientRecord.tradeName ?? clientRecord.fullName ?? clientRecord.companyName ?? "Cliente").split(" ")[0];
    const amountLabel = paidCharge.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const reference = receivable.description || receivable.reference;
    const message =
      `Olá, ${clientName}! Confirmamos o recebimento de ${amountLabel} referente a ${reference}. Obrigado! — Informativo Regional`;

    const phone = (clientRecord.whatsapp ?? clientRecord.phonePrimary ?? "").replace(/\D/g, "");
    const normalizedPhone = phone && !phone.startsWith("55") ? `55${phone}` : phone;
    const whatsappHref = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : undefined;

    return {
      ok: true,
      message,
      hasWhatsapp: Boolean(normalizedPhone),
      whatsappHref,
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function sendPaymentConfirmationAction(
  receivableId: string,
): Promise<{ error: string } | { ok: true; status: "sent" }> {
  const permissionError = await checkFinanceAction("pix_enviar");
  if (permissionError) return { error: permissionError };
  const client = createSupabaseServerClient();
  let toPhone = "";
  let clientId = "";
  let message = "";
  let actorId: string | undefined;

  try {
    const receivable = await getReceivableService(client).getById(receivableId);
    const [clientRecord, charges, resolvedActorId] = await Promise.all([
      getClientService(client).getById(receivable.clientId),
      getPaymentChargeService(client).listForReceivable(receivableId),
      resolveActorId(client),
    ]);
    actorId = resolvedActorId;
    clientId = clientRecord.id;
    toPhone = clientRecord.whatsapp ?? clientRecord.phonePrimary ?? "";
    if (!toPhone) return { error: "Cadastro sem WhatsApp." };

    const paidCharge = charges
      .filter((charge) => charge.status === "paid")
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
    if (!paidCharge) return { error: "Nenhuma cobrança Pix paga encontrada neste título." };

    const clientName = (clientRecord.tradeName ?? clientRecord.fullName ?? clientRecord.companyName ?? "Cliente").split(" ")[0];
    const amountLabel = paidCharge.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const reference = receivable.description || receivable.reference;
    message = `Pagamento confirmado: ${amountLabel} • ${reference}`;

    const sent = await sendWhatsappPaymentConfirmedTemplate({
      toPhone,
      clientName,
      reference,
      amountLabel,
      paymentMethodLabel: "PIX",
      transactionId: paidCharge.providerChargeId || paidCharge.id,
    });

    await createBillingMessageLogRepositorySupabase(client).create({
      receivableId,
      clientId,
      channel: "whatsapp",
      toPhone,
      message,
      status: "sent",
      providerMessageId: sent.providerMessageId,
      createdByProfileId: actorId,
    });

    revalidatePath(`${LIST_PATH}/${receivableId}`);
    return { ok: true, status: "sent" };
  } catch (error) {
    if (toPhone && clientId) {
      try {
        await createBillingMessageLogRepositorySupabase(client).create({
          receivableId,
          clientId,
          channel: "whatsapp",
          toPhone,
          message: message || "Confirmação de pagamento",
          status: "failed",
          errorMessage: toErrorMessage(error),
          createdByProfileId: actorId,
        });
      } catch {
        // Não mascara o erro real do provedor.
      }
    }
    return { error: toErrorMessage(error) };
  }
}

export interface InstallmentPayload extends ReceivableFormPayload {
  index: number;
}

/**
 * Gera parcelas/competências de um contrato (item 7) — mesmo espírito
 * de generateReceivablesForSubscriptionPeriodAction: cada item (já
 * revisado/ajustado individualmente na prévia) é criado via
 * ReceivableService.register() comum (contratos não têm a restrição de
 * unicidade por competência — "contratos podem ter múltiplos títulos
 * legítimos no mesmo mês", item 5), nunca silenciosamente.
 */
export async function generateContractInstallmentsAction(
  payloads: InstallmentPayload[],
): Promise<{ results: BatchGenerationItemResult[] }> {
  const permissionError = await checkFinanceAction("titulos_criar");
  if (permissionError) return { results: payloads.map((payload) => ({ competencyDate: payload.competencyDate, ok: false, error: permissionError })) };
  const client = createSupabaseServerClient();
  const service = getReceivableService(client);
  const results: BatchGenerationItemResult[] = [];

  for (const payload of payloads) {
    const validationError = validateReceivablePayload(payload);
    if (validationError) {
      results.push({ competencyDate: payload.competencyDate, ok: false, error: validationError });
      continue;
    }
    try {
      await service.register(toServiceInput(payload));
      results.push({ competencyDate: payload.competencyDate, ok: true });
    } catch (error) {
      results.push({ competencyDate: payload.competencyDate, ok: false, error: toErrorMessage(error) });
    }
  }

  revalidatePath(LIST_PATH);
  return { results };
}
