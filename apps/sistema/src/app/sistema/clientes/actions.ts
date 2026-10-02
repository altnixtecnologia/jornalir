"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ClientDuplicateFieldError } from "@ir/core";
import type { ClientInput } from "@ir/core";
import { getClientService } from "../../../composition/clientes";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { validateClientPayload, type ClientFormPayload } from "../../../features/clientes/clientFormTypes";

const LIST_PATH = "/sistema/clientes";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  if (error instanceof ClientDuplicateFieldError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível salvar o cliente.";
}

function toServiceInput(payload: ClientFormPayload): ClientInput {
  return {
    kind: payload.kind,
    status: payload.status,
    fullName: payload.fullName,
    cpf: payload.cpf,
    birthDate: payload.birthDate || undefined,
    companyName: payload.companyName,
    tradeName: payload.tradeName,
    cnpj: payload.cnpj,
    stateRegistration: payload.stateRegistration,
    responsibleName: payload.responsibleName,
    responsibleCpf: payload.responsibleCpf,
    phonePrimary: payload.phonePrimary,
    phoneSecondary: payload.phoneSecondary,
    whatsapp: payload.whatsapp,
    email: payload.email,
    address: {
      zip: payload.addressZip,
      street: payload.addressStreet,
      number: payload.addressNumber,
      complement: payload.addressComplement,
      neighborhood: payload.addressNeighborhood,
      city: payload.addressCity,
      state: payload.addressState,
    },
    notes: payload.notes,
    roles: payload.roles,
  };
}

/**
 * Cria um cliente — mesmo contrato de resultado do resto do editorial
 * ({error} | void): a ação redireciona pro detalhe recém-criado em caso de
 * sucesso, e redirect() nunca retorna de verdade.
 */
export async function createClient(payload: ClientFormPayload): Promise<ActionResult> {
  const validationError = validateClientPayload(payload);
  if (validationError) return { error: validationError };

  let clientId: string;
  try {
    const client = await getClientService(createSupabaseServerClient()).register(toServiceInput(payload));
    clientId = client.id;
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${clientId}`);
}

export async function updateClient(id: string, payload: ClientFormPayload): Promise<ActionResult> {
  const validationError = validateClientPayload(payload);
  if (validationError) return { error: validationError };

  try {
    await getClientService(createSupabaseServerClient()).update(id, toServiceInput(payload));
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  redirect(`${LIST_PATH}/${id}`);
}
