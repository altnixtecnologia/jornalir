"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentMethod, AdjustmentType } from "@ir/types";
import type { ReceivableInput } from "@ir/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBillingMessageService, getPaymentChargeService, getReceivableService } from "../../../../composition/financeiro";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { isLocalPreviewEnabled, LOCAL_PREVIEW_PROFILE } from "../../../../lib/auth/localPreview";
import { buildBillingMessage, ClientWithoutWhatsappError } from "@ir/core";
import { parseAmount, validateReceivablePayload, type ReceivableFormPayload } from "../../../../features/financeiro/receivableFormTypes";

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
  try {
    await getReceivableService(createSupabaseServerClient()).cancel(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(LIST_PATH);
}

export async function reopenReceivableAction(id: string): Promise<ActionResult> {
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
}

export async function addReceiptAction(receivableId: string, input: ReceiptFormInput): Promise<ActionResult> {
  try {
    await getReceivableService(createSupabaseServerClient()).addReceipt(receivableId, {
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
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  revalidatePath(LIST_PATH);
}

export interface SettleWithDifferenceFormInput extends ReceiptFormInput {
  reason: string;
  authorizedByProfileId: string;
}

export async function settleWithDifferenceAction(receivableId: string, input: SettleWithDifferenceFormInput): Promise<ActionResult> {
  try {
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
  const amount = parseAmount(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Informe um valor válido para a cobrança." };
  if (amount < 5) return { error: "O Asaas exige cobrança Pix mínima de R$ 5,00." };
  try {
    const client = createSupabaseServerClient();
    await getPaymentChargeService(client).createPixCharge({
      receivableId,
      clientId,
      amount,
      description: input.description.trim() || undefined,
      expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T23:59:59`).toISOString() : undefined,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
  return { ok: true };
}

export async function cancelPixChargeAction(chargeId: string, receivableId: string, reason: string): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const cancelledByProfileId = await resolveActorId(client);
    await getPaymentChargeService(client).cancelPixCharge(chargeId, { cancelledByProfileId, cancellationReason: reason });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${receivableId}`);
}

/**
 * SÓ existe pra demonstração em preview (SYSTEM_LOCAL_PREVIEW=1) — nenhum
 * webhook real confirma cobranças nesta fase. Fora do preview, o
 * composition ainda usa o PixProvider "indisponível", então esta ação
 * nunca é exposta pela UI (ver PixChargePanel: botão só aparece quando
 * localPreview=true). Delega ao mesmo PaymentChargeService.confirmPixCharge
 * que, fora do preview, chamaria a RPC atômica confirm_payment_charge.
 */
export async function confirmPixChargeAction(
  chargeId: string,
  receivableId: string,
): Promise<{ error: string } | { ok: true; overpaymentAmount: number }> {
  try {
    const client = createSupabaseServerClient();
    const receivedByProfileId = await resolveActorId(client);
    const result = await getPaymentChargeService(client).confirmPixCharge(chargeId, new Date().toISOString().slice(0, 10), receivedByProfileId);
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
  try {
    const client = createSupabaseServerClient();
    const [clientRecord, createdByProfileId] = await Promise.all([getClientService(client).getById(clientId), resolveActorId(client)]);
    const log = await getBillingMessageService(client).send({
      receivableId,
      clientId,
      toPhone: clientRecord.whatsapp,
      message,
      createdByProfileId,
    });
    revalidatePath(`${LIST_PATH}/${receivableId}`);
    return { ok: true, status: log.status === "failed" ? "sent" : log.status };
  } catch (error) {
    if (error instanceof ClientWithoutWhatsappError) return { error: error.message };
    return { error: toErrorMessage(error) };
  }
}

/** Compõe a prévia da mensagem (nunca envia) — usada pelo modal "Enviar ao cliente" antes de confirmar. */
export async function buildBillingMessagePreviewAction(receivableId: string): Promise<{ error: string } | { ok: true; message: string; hasWhatsapp: boolean }> {
  try {
    const client = createSupabaseServerClient();
    const receivable = await getReceivableService(client).getById(receivableId);
    const clientRecord = await getClientService(client).getById(receivable.clientId);
    const message = buildBillingMessage({
      clientFirstName: (clientRecord.fullName ?? clientRecord.companyName ?? "Cliente").split(" ")[0],
      receivable: { sourceType: receivable.sourceType, description: receivable.description, dueDate: receivable.dueDate },
      amount: receivable.balance,
    });
    return { ok: true, message, hasWhatsapp: Boolean(clientRecord.whatsapp) };
  } catch (error) {
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
