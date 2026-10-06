"use server";

import { revalidatePath } from "next/cache";
import type { Article, EditorialPlacementType } from "@ir/types";
import { getArticleService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const LIST_PATH = "/sistema/editorial/destaques";

type ActionResult = { error: string } | { ok: true; article: Article };
type ReorderResult = { error: string } | { ok: true };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a ação.";
}

/** Fixar/desafixar em qualquer destaque sem alterar conteúdo ou status. */
export async function setPlacementPinnedAction(articleId: string, pinned: boolean): Promise<ActionResult> {
  try {
    const article = await getArticleService(createSupabaseServerClient()).setPlacementPinned(articleId, pinned);
    revalidatePath(LIST_PATH);
    return { ok: true, article };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * Remove só o placement — a matéria continua existindo, publicada, na sua
 * editoria/localidade; nunca um DELETE de matéria (Fase 29, item 2).
 */
export async function removeFromPlacementAction(articleId: string): Promise<ActionResult> {
  try {
    const article = await getArticleService(createSupabaseServerClient()).removeFromPlacement(articleId);
    revalidatePath(LIST_PATH);
    return { ok: true, article };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** Ordem manual entre matérias fixadas de uma mesma posição. */
export async function reorderPinnedPlacementAction(
  type: Exclude<EditorialPlacementType, "none">,
  orderedArticleIds: string[],
): Promise<ReorderResult> {
  try {
    await getArticleService(createSupabaseServerClient()).reorderPinnedPlacement(type, orderedArticleIds);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
