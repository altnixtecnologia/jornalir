import type { RegionArticleExtraction } from "@ir/pdf-extraction/src/newspaper";
import type { CaptureRegionInput } from "../../providers/supabase/pdfCaptureRegions.supabase";

/**
 * Salvamento EXPLÍCITO dos rascunhos da captura visual (botão "Salvar
 * rascunhos"). Durante a captura nada é gravado — o modal só altera estado
 * temporário e marca a matéria como "pendente". Este módulo é o ÚNICO
 * caminho que aciona o banco: cria as matérias novas, atualiza as já
 * salvas e arquiva as removidas, uma por vez, devolvendo o resultado de
 * cada uma para o modal só mostrar "Salvo" depois da confirmação real.
 *
 * Reaproveita as funções SQL já existentes (save_pdf_capture_draft /
 * save_pdf_capture_state) e a Server Action de arquivar, via `deps` —
 * puro, sem React, testável com dependências falsas.
 */

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface SaveableCapture {
  /** Chave estável: UUID gerado ao desenhar (matérias novas) ou o id da matéria (carregadas). */
  id: string;
  articleId: string | null;
  updatedAtISO: string | null;
  /** Matéria já salva cuja última região foi removida — arquivada só ao salvar. */
  pendingArchive?: boolean;
  title: string;
  subtitle: string;
  body: string;
  needsReview: boolean;
  areas: Array<{ page: number; rect: { x: number; y: number; width: number; height: number } }>;
  perAreaExtraction: RegionArticleExtraction[];
  saveStatus: SaveStatus;
}

export type SaveOutcome = "created" | "updated" | "archived" | "dropped" | "failed";

export interface SaveResult {
  captureId: string;
  outcome: SaveOutcome;
  articleId?: string;
  updatedAt?: string;
  error?: string;
}

export interface SaveBatchSummary {
  created: number;
  updated: number;
  archived: number;
  failed: number;
}

export interface SaveBatchDeps {
  createDraft: (input: {
    editionId: string;
    page: number;
    title: string;
    subtitle: string;
    body: string;
    clientCaptureId: string;
    regions: CaptureRegionInput[];
  }) => Promise<{ ok: true; data: { articleId: string; updatedAt: string } } | { ok: false; error: string }>;
  saveState: (input: {
    articleId: string;
    expectedUpdatedAt: string;
    title: string;
    subtitle: string;
    body: string;
    needsReview: boolean;
    regions: CaptureRegionInput[];
  }) => Promise<
    { ok: true; data: { applied: boolean; updatedAt: string } } | { ok: false; error: string; conflict?: boolean }
  >;
  archiveDraft: (articleId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Estado atual no banco — só usado para reconhecer uma gravação que já tinha dado certo (resposta perdida). */
  loadDrafts: (editionId: string) => Promise<
    | { ok: true; data: Array<{ articleId: string; title: string; subtitle: string | null; body: string; updatedAt: string }> }
    | { ok: false; error: string }
  >;
}

/** Só serializa o estado já decidido pelo cliente — nunca recalcula texto. */
export function buildRegionsPayload(
  areas: SaveableCapture["areas"],
  perAreaExtraction: RegionArticleExtraction[],
): CaptureRegionInput[] {
  return areas.map((area, index) => {
    const extraction = perAreaExtraction[index];
    return {
      page: area.page,
      rect: area.rect,
      sortOrder: index,
      extractedTitle: extraction?.title || null,
      extractedSubtitle: extraction?.subtitle || null,
      extractedBody: extraction?.bodyParagraphs?.length ? extraction.bodyParagraphs.join("\n\n") : null,
      needsReview: extraction?.needsReview ?? false,
      warnings: extraction?.warnings ?? [],
    };
  });
}

/** Matérias que precisam ir ao banco: alteradas/novas (pendentes) ou que falharam antes. */
export function isUnsaved(capture: Pick<SaveableCapture, "saveStatus">): boolean {
  return capture.saveStatus === "pending" || capture.saveStatus === "error" || capture.saveStatus === "saving";
}

export function summarize(results: SaveResult[]): SaveBatchSummary {
  return {
    created: results.filter((r) => r.outcome === "created").length,
    updated: results.filter((r) => r.outcome === "updated").length,
    archived: results.filter((r) => r.outcome === "archived").length,
    failed: results.filter((r) => r.outcome === "failed").length,
  };
}

/** Tenta de novo uma atualização que deu conflito: se o banco já tem exatamente o que queremos gravar (resposta anterior perdida), conta como salva. */
async function alreadyPersisted(capture: SaveableCapture, editionId: string, deps: SaveBatchDeps): Promise<string | null> {
  const loaded = await deps.loadDrafts(editionId);
  if (!loaded.ok) return null;
  const current = loaded.data.find((draft) => draft.articleId === capture.articleId);
  if (!current) return null;
  const sameText =
    current.title === capture.title && (current.subtitle ?? "") === capture.subtitle && current.body === capture.body;
  return sameText ? current.updatedAt : null;
}

export async function saveDraftsBatch(
  captures: SaveableCapture[],
  editionId: string,
  deps: SaveBatchDeps,
): Promise<{ results: SaveResult[]; summary: SaveBatchSummary }> {
  const results: SaveResult[] = [];

  for (const capture of captures.filter(isUnsaved)) {
    try {
      if (capture.pendingArchive) {
        if (!capture.articleId) {
          results.push({ captureId: capture.id, outcome: "dropped" });
          continue;
        }
        const archived = await deps.archiveDraft(capture.articleId);
        results.push(
          archived.ok
            ? { captureId: capture.id, outcome: "archived", articleId: capture.articleId }
            : { captureId: capture.id, outcome: "failed", error: archived.error },
        );
        continue;
      }

      if (!capture.articleId) {
        const created = await deps.createDraft({
          editionId,
          page: capture.areas[0].page,
          title: capture.title,
          subtitle: capture.subtitle,
          body: capture.body,
          clientCaptureId: capture.id,
          regions: buildRegionsPayload(capture.areas, capture.perAreaExtraction),
        });
        results.push(
          created.ok
            ? { captureId: capture.id, outcome: "created", articleId: created.data.articleId, updatedAt: created.data.updatedAt }
            : { captureId: capture.id, outcome: "failed", error: created.error },
        );
        continue;
      }

      const saved = await deps.saveState({
        articleId: capture.articleId,
        expectedUpdatedAt: capture.updatedAtISO ?? new Date(0).toISOString(),
        title: capture.title,
        subtitle: capture.subtitle,
        body: capture.body,
        needsReview: capture.needsReview,
        regions: buildRegionsPayload(capture.areas, capture.perAreaExtraction),
      });
      if (saved.ok) {
        results.push({ captureId: capture.id, outcome: "updated", articleId: capture.articleId, updatedAt: saved.data.updatedAt });
        continue;
      }
      if (saved.conflict) {
        const recovered = await alreadyPersisted(capture, editionId, deps);
        if (recovered) {
          results.push({ captureId: capture.id, outcome: "updated", articleId: capture.articleId, updatedAt: recovered });
          continue;
        }
      }
      results.push({ captureId: capture.id, outcome: "failed", error: saved.error });
    } catch (error) {
      results.push({
        captureId: capture.id,
        outcome: "failed",
        error: error instanceof Error ? error.message : "Falha de conexão ao salvar.",
      });
    }
  }

  return { results, summary: summarize(results) };
}

export function describeSummary(summary: SaveBatchSummary): string {
  const parts: string[] = [];
  if (summary.created) parts.push(`${summary.created} criada(s)`);
  if (summary.updated) parts.push(`${summary.updated} atualizada(s)`);
  if (summary.archived) parts.push(`${summary.archived} arquivada(s)`);
  if (summary.failed) parts.push(`${summary.failed} com erro`);
  return parts.length ? parts.join(" · ") : "Nada a salvar.";
}
