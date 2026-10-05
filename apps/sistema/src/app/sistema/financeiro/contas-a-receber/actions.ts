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
