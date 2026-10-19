"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EditorialPlacement, EditorialTextStyle } from "@ir/types";
import { getArticleService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  validateArticlePayload,
  type ArticleFormIntent,
  type ArticleFormPayload,
} from "../../../../features/editorial/articleFormTypes";
import { isDefaultTextStyle } from "../../../../features/editorial/textStyle";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const LIST_PATH = "/sistema/editorial/materias";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a matéria.";
}

/** Auditoria não pode travar a ação principal — se a gravação do log
 * falhar, a matéria já foi salva/publicada; só registra o erro no console. */
async function logArticleEvent(
  client: ReturnType<typeof createSupabaseServerClient>,
  actorId: string,
  articleId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAuditEventSupabase(client, { userId: actorId, entityType: "articles", entityId: articleId, action, metadata });
  } catch (error) {
    console.error("Falha ao registrar auditoria da matéria:", error instanceof Error ? error.message : error);
  }
}

function buildPlacement(payload: ArticleFormPayload): EditorialPlacement {
  if (payload.placementType === "none") {
    return { type: "none" };
  }
  return {
    type: payload.placementType,
    pinned: payload.pinned || undefined,
    // A fixação começa imediatamente. Só existe uma data opcional de saída;
    // sem data, permanece fixa até alguém desligar o controle.
    startsAt: undefined,
    endsAt: payload.pinned ? (payload.placementEndsAt || undefined) : undefined,
  };
}

/** Não persiste o estilo quando é igual ao padrão (mantém os dados enxutos). */
function styleOrUndefined(style: EditorialTextStyle): EditorialTextStyle | undefined {
  return isDefaultTextStyle(style) ? undefined : style;
}

/** Página da edição é só um número corrigível — nunca cria vínculo com edição a partir daqui. */
function parseEditionPageNumber(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

type ArticleEditorTab = "conteudo" | "imagens" | "publicacao";

function revalidateAndRedirect(id: string, tab?: ArticleEditorTab, linkFailed = false): never {
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  const query = new URLSearchParams();
  if (tab) query.set("aba", tab);
  if (linkFailed) query.set("aviso", "pauta-nao-vinculada");
  redirect(`${LIST_PATH}/${id}${query.size ? "?" + query.toString() : ""}`);
}

export async function createArticle(
  payload: ArticleFormPayload,
  intent: ArticleFormIntent,
  returnTab?: ArticleEditorTab,
  pautaId?: string,
): Promise<ActionResult> {
  const validationError = validateArticlePayload(payload, intent);
  if (validationError) return { error: validationError };

  const client = createSupabaseServerClient();
  const articleService = getArticleService(client);
  let articleId: string;
  let pautaLinkFailed = false;
  try {
    const AUDIT = await getAuditContext(client);
    if (pautaId) {
      if (!/^[0-9a-f-]{36}$/i.test(pautaId)) return { error: "Pauta invalida." };
      const access = await client.rpc("has_staff_module_access", { p_module: "pauta", p_write: true });
      if (access.error || access.data !== true) return { error: "Sem permissao para vincular materia a pauta." };
      const { data: availablePauta, error: pautaError } = await client.from("weekly_pauta_items")
        .select("id").eq("id", pautaId).is("article_id", null).maybeSingle();
      if (pautaError || !availablePauta) return { error: pautaError?.message ?? "Pauta nao encontrada ou ja vinculada." };
    }
    const created = await articleService.saveDraft(
      {
        title: payload.title.trim(),
        titleStyle: styleOrUndefined(payload.titleStyle),
        subtitle: payload.subtitle.trim() || undefined,
        subtitleStyle: styleOrUndefined(payload.subtitleStyle),
        body: payload.body,
        sectionId: payload.sectionId,
        localityId: payload.localityId,
        urgent: payload.urgent,
        notificationMode: payload.notificationMode,
        media: payload.media,
        createdBy: AUDIT.actorId,
      },
      AUDIT,
    );
    articleId = created.id;
    await logArticleEvent(client, AUDIT.actorId, articleId, "create", { title: created.title, status: "draft" });
    if (pautaId && /^[0-9a-f-]{36}$/i.test(pautaId)) {
      const { data: linkedPauta, error: linkError } = await client
        .from("weekly_pauta_items")
        .update({ article_id: articleId })
        .eq("id", pautaId)
        .is("article_id", null)
        .select("id")
        .maybeSingle();
      if (linkError || !linkedPauta) {
        // A matéria foi criada; evite declarar falha no cadastro e gerar
        // duplicação por tentativa de novo envio.
        pautaLinkFailed = true;
        console.error("Não foi possível vincular a pauta à matéria:", linkError?.message ?? "pauta indisponível");
      } else {
        revalidatePath("/sistema/agenda");
        revalidatePath("/agenda");
      }
    }


    const placement = buildPlacement(payload);
    if (placement.type !== "none") {
      await articleService.updateDraft(articleId, { placement }, AUDIT);
    }

    if (intent === "publish") {
      await articleService.publishNow(articleId, AUDIT);
      await logArticleEvent(client, AUDIT.actorId, articleId, "publish", { title: payload.title.trim(), statusChange: "Rascunho → Publicado" });
    } else if (intent === "schedule") {
      await articleService.schedule(
        articleId,
        { scheduledAt: payload.scheduledAt, placement, notificationMode: payload.notificationMode },
        AUDIT,
      );
      await logArticleEvent(client, AUDIT.actorId, articleId, "schedule", {
        title: payload.title.trim(),
        statusChange: "Rascunho → Agendado",
        scheduledAt: payload.scheduledAt,
      });
    }
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  revalidateAndRedirect(articleId, returnTab, pautaLinkFailed);
}

export async function updateArticle(
  id: string,
  payload: ArticleFormPayload,
  intent: ArticleFormIntent,
  returnTab?: ArticleEditorTab,
): Promise<ActionResult> {
  const validationError = validateArticlePayload(payload, intent);
  if (validationError) return { error: validationError };

  const client = createSupabaseServerClient();
  const articleService = getArticleService(client);
  try {
    const AUDIT = await getAuditContext(client);
    const current = await articleService.getById(id);
    const placement = buildPlacement(payload);
    const editionPageNumber = parseEditionPageNumber(payload.editionPageNumber);
    const baseChanges = {
      title: payload.title.trim(),
      titleStyle: styleOrUndefined(payload.titleStyle),
      subtitle: payload.subtitle.trim() || undefined,
      subtitleStyle: styleOrUndefined(payload.subtitleStyle),
      body: payload.body,
      sectionId: payload.sectionId,
      localityId: payload.localityId,
      urgent: payload.urgent,
      notificationMode: payload.notificationMode,
      media: payload.media,
      placement,
      // Só corrige a página quando o formulário de fato enviou uma (matéria já vinculada a uma edição) —
      // nunca sobrescreve com undefined uma página existente de uma matéria manual sem edição.
      ...(editionPageNumber !== undefined ? { editionPageNumber } : {}),
    };

    const statusLabel: Record<string, string> = {
      draft: "Rascunho", adjusting: "Em ajuste", scheduled: "Agendado", published: "Publicado", archived: "Arquivado",
    };
    const title = payload.title.trim();

    if (intent === "draft") {
      await articleService.updateDraft(
        id,
        { ...baseChanges, status: "draft", publishedAt: undefined, scheduledAt: undefined },
        AUDIT,
      );
      await logArticleEvent(client, AUDIT.actorId, id, "update", {
        title,
        ...(current.status !== "draft" ? { statusChange: `${statusLabel[current.status]} → Rascunho` } : {}),
      });
    } else if (intent === "save") {
      // Editar uma matéria publicada/agendada/arquivada não deve mudar seu
      // status nem sua data só por salvar conteúdo.
      await articleService.updateDraft(id, baseChanges, AUDIT);
      await logArticleEvent(client, AUDIT.actorId, id, "update", { title });
    } else if (intent === "publish") {
      await articleService.updateDraft(
        id,
        { ...baseChanges, ...(current.status === "published" ? { scheduledAt: undefined } : {}) },
        AUDIT,
      );
      // Re-salvar uma matéria que já estava publicada preserva a data
      // original. "Publicar agora" só cria published_at ao sair de outro status.
      if (current.status !== "published") {
        await articleService.publishNow(id, AUDIT);
        await logArticleEvent(client, AUDIT.actorId, id, "publish", { title, statusChange: `${statusLabel[current.status]} → Publicado` });
      } else {
        await logArticleEvent(client, AUDIT.actorId, id, "update", { title });
      }
    } else {
      // Coloca em scheduled já no mesmo salvamento de conteúdo para uma
      // matéria publicada não disputar/expulsar vaga de destaque antes da hora.
      await articleService.updateDraft(id, { ...baseChanges, status: "scheduled" }, AUDIT);
      await articleService.schedule(
        id,
        { scheduledAt: payload.scheduledAt, placement, notificationMode: payload.notificationMode },
        AUDIT,
      );
      await logArticleEvent(client, AUDIT.actorId, id, "schedule", {
        title, statusChange: `${statusLabel[current.status]} → Agendado`, scheduledAt: payload.scheduledAt,
      });
    }
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  revalidateAndRedirect(id, returnTab);
}

export async function archiveArticle(id: string): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const articleService = getArticleService(client);
    const current = await articleService.getById(id);
    await articleService.archive(id, AUDIT);
    // "Arquivar" é a única forma de remoção de matéria no sistema hoje —
    // não existe exclusão definitiva (nunca apagar o rastro).
    await logArticleEvent(client, AUDIT.actorId, id, "archive", { title: current.title, statusChange: `${current.status} → archived` });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  revalidateAndRedirect(id);
}
