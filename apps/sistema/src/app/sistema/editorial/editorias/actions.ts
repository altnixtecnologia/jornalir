"use server";

import { revalidatePath } from "next/cache";
import type { EditorialSection } from "@ir/types";
import { editorialSectionService } from "../../../../composition/editorial";

const LIST_PATH = "/sistema/editorial/editorias";

type ActionResult = { error: string } | { ok: true; section: EditorialSection };
type ReorderResult = { error: string } | { ok: true };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a editoria.";
}

export interface EditorialSectionPayload {
  name: string;
  slug?: string;
  description?: string;
}

export async function createSection(payload: EditorialSectionPayload): Promise<ActionResult> {
  if (!payload.name.trim()) {
    return { error: "Informe o nome da editoria." };
  }
  try {
    const section = await editorialSectionService.create(payload);
    revalidatePath(LIST_PATH);
    return { ok: true, section };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateSection(id: string, payload: EditorialSectionPayload): Promise<ActionResult> {
  if (!payload.name.trim()) {
    return { error: "Informe o nome da editoria." };
  }
  try {
    const section = await editorialSectionService.update(id, payload);
    revalidatePath(LIST_PATH);
    return { ok: true, section };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function setSectionActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const section = await editorialSectionService.setActive(id, active);
    revalidatePath(LIST_PATH);
    return { ok: true, section };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function reorderSections(orderedIds: string[]): Promise<ReorderResult> {
  try {
    await editorialSectionService.reorder(orderedIds);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
