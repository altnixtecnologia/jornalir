import "server-only";

import type { CaptureDraftWithRegions, CaptureRegionInput } from "../../providers/supabase/pdfCaptureRegions.supabase";

/**
 * Salvamento direto dos rascunhos da captura visual (pedido do usuário,
 * 07/11/2026). Mesma estratégia de `editionPdfProxy.ts`: a lógica fica
 * aqui, testável de verdade com `deps` injetadas (sem precisar de uma
 * requisição real do Next.js); `visualCaptureDraftActions.ts` ("use
 * server") só chama estas funções com as deps padrão.
 *
 * Nunca recalcula título/subtítulo/corpo aqui — isso é feito inteiramente
 * no cliente (`combineAreaExtractions`/`appendRegionToCapture`/
 * `removeAreaFromCapture`, já testados); esta camada só persiste o que o
 * cliente decidiu, com permissão e concorrência otimista.
 */

export interface SaveNewCaptureDraftInput {
  editionId: string;
  page: number;
  title: string;
  subtitle: string;
  body: string;
  clientCaptureId: string;
  regions: CaptureRegionInput[];
}

export interface SaveCaptureStateInput {
  articleId: string;
  expectedUpdatedAt: string;
  title: string;
  subtitle: string;
  body: string;
  needsReview: boolean;
  regions: CaptureRegionInput[];
}

export type CaptureDraftActionResult<T> = { ok: true; data: T } | { ok: false; error: string; conflict?: boolean };

export interface VisualCaptureDraftDeps {
  checkCreatePermission: () => Promise<string | null>;
  checkEditPermission: () => Promise<string | null>;
  checkArchivePermission: () => Promise<string | null>;
  createDraft: (input: SaveNewCaptureDraftInput) => Promise<{ articleId: string; updatedAt: string }>;
  saveState: (input: SaveCaptureStateInput) => Promise<{ applied: boolean; updatedAt: string }>;
  loadForEdition: (editionId: string) => Promise<CaptureDraftWithRegions[]>;
  archiveDraft: (articleId: string) => Promise<{ error: string } | { ok: true }>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a captura agora.";
}

// Import dinâmico (mesmo motivo de editionPdfProxy.ts): checkModuleAction/
// createSupabaseServerClient carregam next/headers, que só existe dentro de
// uma requisição real — importar só quando efetivamente chamado (produção)
// permite testar este módulo com deps próprias, sem servidor Next real.
async function defaultCheckCreatePermission(): Promise<string | null> {
  const { checkModuleAction } = await import("../permissions/checkModuleAction");
  return checkModuleAction("editorial", "materias_criar");
}

async function defaultCheckEditPermission(): Promise<string | null> {
  const { checkModuleAction } = await import("../permissions/checkModuleAction");
  return checkModuleAction("editorial", "materias_editar");
}

async function defaultCheckArchivePermission(): Promise<string | null> {
  const { checkModuleAction } = await import("../permissions/checkModuleAction");
  return checkModuleAction("editorial", "materias_arquivar");
}

async function defaultCreateDraft(input: SaveNewCaptureDraftInput): Promise<{ articleId: string; updatedAt: string }> {
  const [{ createSupabaseServerClient }, { createPdfCaptureDraftSupabase }] = await Promise.all([
    import("../supabase/server"),
    import("../../providers/supabase/pdfCaptureRegions.supabase"),
  ]);
  const client = createSupabaseServerClient();
  const result = await createPdfCaptureDraftSupabase(client, {
    editionId: input.editionId,
    page: input.page,
    title: input.title,
    subtitle: input.subtitle || null,
    body: input.body,
    clientCaptureId: input.clientCaptureId,
    regions: input.regions,
  });
  // Auditoria é melhor esforço: a matéria já foi salva se chegou aqui —
  // uma falha ao registrar o log nunca pode desfazer o salvamento (mesmo
  // princípio de logArticleEvent em materias/actions.ts).
  try {
    const [{ getAuditContext }, { recordAuditEventSupabase }] = await Promise.all([
      import("../auth/getAuditContext"),
      import("../../providers/supabase/auditEvents.supabase"),
    ]);
    const audit = await getAuditContext(client);
    await recordAuditEventSupabase(client, {
      userId: audit.actorId,
      entityType: "articles",
      entityId: result.articleId,
      action: "visual_pdf_capture_draft_created",
      metadata: { editionId: input.editionId, page: input.page, title: input.title },
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria da captura visual:", error instanceof Error ? error.message : error);
  }
  return result;
}

async function defaultSaveState(input: SaveCaptureStateInput): Promise<{ applied: boolean; updatedAt: string }> {
  const [{ createSupabaseServerClient }, { savePdfCaptureStateSupabase }] = await Promise.all([
    import("../supabase/server"),
    import("../../providers/supabase/pdfCaptureRegions.supabase"),
  ]);
  const client = createSupabaseServerClient();
  return savePdfCaptureStateSupabase(client, {
    articleId: input.articleId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    title: input.title,
    subtitle: input.subtitle || null,
    body: input.body,
    needsReview: input.needsReview,
    regions: input.regions,
  });
}

async function defaultLoadForEdition(editionId: string): Promise<CaptureDraftWithRegions[]> {
  const [{ createSupabaseServerClient }, { listPdfCaptureDraftsForEditionSupabase }] = await Promise.all([
    import("../supabase/server"),
    import("../../providers/supabase/pdfCaptureRegions.supabase"),
  ]);
  const client = createSupabaseServerClient();
  return listPdfCaptureDraftsForEditionSupabase(client, editionId);
}

async function defaultArchiveDraft(articleId: string): Promise<{ error: string } | { ok: true }> {
  // Reaproveita a Server Action já existente de "Remover" rascunho não
  // publicado (materias/actions.ts, permissão materias_arquivar) — nunca
  // um DELETE novo em articles. Ela já audita e já nunca publica/exclui
  // de verdade.
  const { removeUnpublishedArticle } = await import("../../app/sistema/editorial/materias/actions");
  return removeUnpublishedArticle(articleId);
}

const defaultDeps: VisualCaptureDraftDeps = {
  checkCreatePermission: defaultCheckCreatePermission,
  checkEditPermission: defaultCheckEditPermission,
  checkArchivePermission: defaultCheckArchivePermission,
  createDraft: defaultCreateDraft,
  saveState: defaultSaveState,
  loadForEdition: defaultLoadForEdition,
  archiveDraft: defaultArchiveDraft,
};

export async function saveNewCaptureDraft(
  input: SaveNewCaptureDraftInput,
  deps: VisualCaptureDraftDeps = defaultDeps,
): Promise<CaptureDraftActionResult<{ articleId: string; updatedAt: string }>> {
  const permissionError = await deps.checkCreatePermission();
  if (permissionError) return { ok: false, error: permissionError };
  try {
    const data = await deps.createDraft(input);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function saveCaptureRegionState(
  input: SaveCaptureStateInput,
  deps: VisualCaptureDraftDeps = defaultDeps,
): Promise<CaptureDraftActionResult<{ applied: boolean; updatedAt: string }>> {
  const permissionError = await deps.checkEditPermission();
  if (permissionError) return { ok: false, error: permissionError };
  try {
    const data = await deps.saveState(input);
    if (!data.applied) {
      return {
        ok: false,
        conflict: true,
        error: "Esta matéria foi alterada em outra sessão enquanto você editava. Recarregando os dados mais recentes…",
      };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function loadCaptureDraftsForEdition(
  editionId: string,
  deps: VisualCaptureDraftDeps = defaultDeps,
): Promise<CaptureDraftActionResult<CaptureDraftWithRegions[]>> {
  const permissionError = await deps.checkEditPermission();
  if (permissionError) return { ok: false, error: permissionError };
  try {
    const data = await deps.loadForEdition(editionId);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function removeLastCaptureArea(
  articleId: string,
  deps: VisualCaptureDraftDeps = defaultDeps,
): Promise<CaptureDraftActionResult<{ archived: true }>> {
  const permissionError = await deps.checkArchivePermission();
  if (permissionError) return { ok: false, error: permissionError };
  const result = await deps.archiveDraft(articleId);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, data: { archived: true } };
}
