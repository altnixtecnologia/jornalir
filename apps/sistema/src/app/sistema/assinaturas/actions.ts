"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SubscriptionInput } from "@ir/core";
import { getSubscriptionService } from "../../../composition/assinaturas";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { parseAmount, validateSubscriptionPayload, type SubscriptionFormPayload } from "../../../features/assinaturas/subscriptionFormTypes";

const LIST_PATH = "/sistema/assinaturas";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a assinatura.";
}

function toServiceInput(payload: SubscriptionFormPayload): SubscriptionInput {
  return {
    clientId: payload.clientId,
    serviceType: payload.serviceType,
    status: payload.status,
    amount: parseAmount(payload.amount),
    periodicity: payload.periodicity,
    startsAt: payload.startsAt,
    dueDate: payload.dueDate || undefined,
    notes: payload.notes,
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
