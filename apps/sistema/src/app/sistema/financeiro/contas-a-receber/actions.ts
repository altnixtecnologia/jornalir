"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentMethod, AdjustmentType } from "@ir/types";
import type { ReceivableInput } from "@ir/core";
import { getReceivableService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { parseAmount, validateReceivablePayload, type ReceivableFormPayload } from "../../../../features/financeiro/receivableFormTypes";

const LIST_PATH = "/sistema/financeiro/contas-a-receber";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
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
