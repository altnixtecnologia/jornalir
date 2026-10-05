"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SubscriptionInput } from "@ir/core";
import { getSubscriptionService } from "../../../composition/assinaturas";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { parseAmount, parseDueDay, validateSubscriptionPayload, type SubscriptionFormPayload } from "../../../features/assinaturas/subscriptionFormTypes";

const LIST_PATH = "/sistema/assinaturas";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a assinatura.";
}

function toServiceInput(payload: SubscriptionFormPayload): SubscriptionInput {
  const isImpresso = payload.serviceType === "impresso";
  const isTv = payload.serviceType === "tv";
  return {
    clientId: payload.clientId,
    serviceType: payload.serviceType,
    status: payload.status,
    amount: parseAmount(payload.amount),
    periodicity: payload.periodicity,
    startsAt: payload.startsAt,
    dueDay: parseDueDay(payload.dueDay),
    nextDueDate: payload.nextDueDate || undefined,
    endsAt: payload.endsAt || undefined,
    notes: payload.notes,
    print: isImpresso
      ? {
          copies: payload.printCopies.trim() ? Number(payload.printCopies) : 1,
          addressZip: payload.printAddressZip,
          addressStreet: payload.printAddressStreet,
          addressNumber: payload.printAddressNumber,
          addressComplement: payload.printAddressComplement,
          addressNeighborhood: payload.printAddressNeighborhood,
          addressCity: payload.printAddressCity,
          addressState: payload.printAddressState,
        }
      : undefined,
    tv: isTv
      ? {
          externalSource: payload.externalSource,
          externalClientReference: payload.externalClientReference,
          externalDeviceReference: payload.externalDeviceReference,
        }
      : undefined,
  };
}

export async function createSubscription(payload: SubscriptionFormPayload): Promise<ActionResult> {
  const validationError = validateSubscriptionPayload(payload);
  if (validationError) return { error: validationError };

  let subscriptionId: string;
  try {
    const subscription = await getSubscriptionService(createSupabaseServerClient()).register(toServiceInput(payload));
    subscriptionId = subscription.id;
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${subscriptionId}`);
}

export async function updateSubscription(id: string, payload: SubscriptionFormPayload): Promise<ActionResult> {
  const validationError = validateSubscriptionPayload(payload);
  if (validationError) return { error: validationError };

  try {
    await getSubscriptionService(createSupabaseServerClient()).update(id, toServiceInput(payload));
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  redirect(`${LIST_PATH}/${id}`);
}

/**
 * Transições dedicadas (ver SubscriptionService/canTransitionSubscriptionStatus):
 * ativa <-> suspensa livremente, qualquer uma -> cancelada, cancelada é
 * estado final. Nunca redirecionam — ficam na própria página de detalhe
 * (revalidatePath + router.refresh() no cliente, mesmo padrão já usado em
 * ArticleForm.handleBack pra descartar o Router Cache ao voltar).
 */
export async function suspendSubscriptionAction(id: string): Promise<ActionResult> {
  try {
    await getSubscriptionService(createSupabaseServerClient()).suspend(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(LIST_PATH);
}

export async function reactivateSubscriptionAction(id: string): Promise<ActionResult> {
  try {
    await getSubscriptionService(createSupabaseServerClient()).reactivate(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(LIST_PATH);
}

export async function cancelSubscriptionAction(id: string, reason: string): Promise<ActionResult> {
  try {
    await getSubscriptionService(createSupabaseServerClient()).cancel(id, reason);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath(LIST_PATH);
}
