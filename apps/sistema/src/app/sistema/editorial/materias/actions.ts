"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuditContext, EditorialPlacement, EditorialTextStyle } from "@ir/types";
import { articleService } from "../../../../composition/editorial";
import {
  validateArticlePayload,
  type ArticleFormIntent,
  type ArticleFormPayload,
} from "../../../../features/editorial/articleFormTypes";
import { isDefaultTextStyle } from "../../../../features/editorial/textStyle";

// Identidade simulada: não há autenticação real nesta fase (ver docs/ARCHITECTURE.md).
const AUDIT: AuditContext = { actorId: "editor-sistema", actorRole: "editorial" };

const LIST_PATH = "/sistema/editorial/materias";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a matéria.";
}

function buildPlacement(payload: ArticleFormPayload): EditorialPlacement {
  if (payload.placementType === "none") {
    return { type: "none" };
  }
  return {
    type: payload.placementType,
    startsAt: payload.placementStartsAt || undefined,
    endsAt: payload.placementEndsAt || undefined,
  };
}

/** Não persiste o estilo quando é igual ao padrão (mantém os dados enxutos). */
function styleOrUndefined(style: EditorialTextStyle): EditorialTextStyle | undefined {
  return isDefaultTextStyle(style) ? undefined : style;
}

function revalidateAndRedirect(id: string): never {
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  redirect(`${LIST_PATH}/${id}`);
}

export async function createArticle(
  payload: ArticleFormPayload,
  intent: ArticleFormIntent,
): Promise<ActionResult> {
  const validationError = validateArticlePayload(payload, intent);
  if (validationError) return { error: validationError };

  let articleId: string;
  try {
    const created = await articleService.saveDraft(
      {
        title: payload.title.trim(),
        titleStyle: styleOrUndefined(payload.titleStyle),
        subtitle: payload.subtitle.trim() || undefined,
        subtitleStyle: styleOrUndefined(payload.subtitleStyle),
        body: payload.body,
        sectionId: payload.sectionId,
        localityId: payload.localityId,
        notificationMode: payload.notificationMode,
        media: payload.media,
        createdBy: AUDIT.actorId,
      },
      AUDIT,
    );
    articleId = created.id;

    const placement = buildPlacement(payload);
    if (placement.type !== "none") {
      await articleService.updateDraft(articleId, { placement }, AUDIT);
    }

    if (intent === "publish") {
      await articleService.publishNow(articleId, AUDIT);
    } else if (intent === "schedule") {
      await articleService.schedule(
        articleId,
        { scheduledAt: payload.scheduledAt, placement, notificationMode: payload.notificationMode },
        AUDIT,
      );
    }
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  revalidateAndRedirect(articleId);
}

export async function updateArticle(
  id: string,
  payload: ArticleFormPayload,
  intent: ArticleFormIntent,
): Promise<ActionResult> {
  const validationError = validateArticlePayload(payload, intent);
  if (validationError) return { error: validationError };

  try {
    const placement = buildPlacement(payload);
    const baseChanges = {
      title: payload.title.trim(),
      titleStyle: styleOrUndefined(payload.titleStyle),
      subtitle: payload.subtitle.trim() || undefined,
      subtitleStyle: styleOrUndefined(payload.subtitleStyle),
      body: payload.body,
      sectionId: payload.sectionId,
      localityId: payload.localityId,
      notificationMode: payload.notificationMode,
      media: payload.media,
      placement,
    };

    if (intent === "draft") {
      await articleService.updateDraft(
        id,
        { ...baseChanges, status: "draft", publishedAt: undefined, scheduledAt: undefined },
        AUDIT,
      );
    } else {
      await articleService.updateDraft(id, baseChanges, AUDIT);
      if (intent === "publish") {
        await articleService.publishNow(id, AUDIT);
      } else {
        await articleService.schedule(
          id,
          { scheduledAt: payload.scheduledAt, placement, notificationMode: payload.notificationMode },
          AUDIT,
        );
      }
    }
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  revalidateAndRedirect(id);
}

export async function archiveArticle(id: string): Promise<ActionResult> {
  try {
    await articleService.archive(id, AUDIT);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  revalidateAndRedirect(id);
}
