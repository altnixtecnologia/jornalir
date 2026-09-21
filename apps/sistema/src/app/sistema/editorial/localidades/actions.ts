"use server";

import { revalidatePath } from "next/cache";
import type { Locality, LocalityScope } from "@ir/types";
import { getLocalityService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const LIST_PATH = "/sistema/editorial/localidades";

type ActionResult = { error: string } | { ok: true; locality: Locality };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a localidade.";
}

export interface LocalityPayload {
  name: string;
  slug?: string;
  scope: LocalityScope;
}

export async function createLocality(payload: LocalityPayload): Promise<ActionResult> {
  if (!payload.name.trim()) {
    return { error: "Informe o nome da localidade." };
  }
  try {
    const locality = await getLocalityService(createSupabaseServerClient()).create(payload);
    revalidatePath(LIST_PATH);
    return { ok: true, locality };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateLocality(id: string, payload: LocalityPayload): Promise<ActionResult> {
  if (!payload.name.trim()) {
    return { error: "Informe o nome da localidade." };
  }
  try {
    const locality = await getLocalityService(createSupabaseServerClient()).update(id, payload);
    revalidatePath(LIST_PATH);
    return { ok: true, locality };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function setLocalityActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const locality = await getLocalityService(createSupabaseServerClient()).setActive(id, active);
    revalidatePath(LIST_PATH);
    return { ok: true, locality };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
