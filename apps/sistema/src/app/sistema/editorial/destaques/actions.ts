"use server";

import { revalidatePath } from "next/cache";
import type { Article } from "@ir/types";
import { getArticleService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const LIST_PATH = "/sistema/editorial/destaques";

type ActionResult = { error: string } | { ok: true; article: Article };
type ReorderResult = { error: string } | { ok: true };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a ação.";
}

/**
 * Fixar/desafixar (só faz sentido em `mainCover`) — nunca altera editoria,
 * localidade, conteúdo ou status da matéria (Fase 29, item 2).
 */
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

/** Ordem manual entre fixadas de `mainCover` — as demais posições giram sozinhas por recência. */
export async function reorderPinnedMainCoverAction(orderedArticleIds: string[]): Promise<ReorderResult> {
  try {
    await getArticleService(createSupabaseServerClient()).reorderPinnedMainCover(orderedArticleIds);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
