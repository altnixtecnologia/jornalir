"use server";

import { revalidatePath } from "next/cache";
import type { Article, EditorialPlacementType } from "@ir/types";
import { getArticleService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const LIST_PATH = "/sistema/editorial/destaques";

type ActionResult = { error: string } | { ok: true; article: Article };
type ReorderResult = { error: string } | { ok: true };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a ação.";
}

async function logPlacementEvent(
  client: ReturnType<typeof createSupabaseServerClient>,
  actorId: string,
  articleId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAuditEventSupabase(client, { userId: actorId, entityType: "articles", entityId: articleId, action, metadata });
  } catch (error) {
    console.error("Falha ao registrar auditoria de destaque:", error instanceof Error ? error.message : error);
  }
}

/** Fixar/desafixar em qualquer destaque sem alterar conteúdo ou status. */
export async function setPlacementPinnedAction(articleId: string, pinned: boolean): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const article = await getArticleService(client).setPlacementPinned(articleId, pinned);
    await logPlacementEvent(client, AUDIT.actorId, articleId, "update_placement", {
      title: article.title,
      placementChange: pinned ? "fixado em destaque" : "desafixado do destaque",
    });
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
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const article = await getArticleService(client).removeFromPlacement(articleId);
    await logPlacementEvent(client, AUDIT.actorId, articleId, "update_placement", {
      title: article.title,
      placementChange: "removido do destaque",
    });
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
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getArticleService(client).reorderPinnedPlacement(type, orderedArticleIds);
    // Entidade própria (não uma matéria específica) — usa um id fixo para
    // agrupar o histórico de reordenações por tipo de posição.
    await logPlacementEvent(client, AUDIT.actorId, "00000000-0000-4000-8000-000000000001", "reorder_placement", {
      placementType: type,
      orderedArticleIds,
    });
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
