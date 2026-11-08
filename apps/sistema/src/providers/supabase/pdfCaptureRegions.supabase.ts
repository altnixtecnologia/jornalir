import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Acesso de dados da captura visual de matérias (salvamento automático dos
 * rascunhos — pedido do usuário, 07/11/2026). Chamadas finas para as
 * funções SECURITY DEFINER `save_pdf_capture_draft`/`save_pdf_capture_state`
 * (atomicidade real: matéria + regiões na mesma transação, sem precisar
 * tocar `ArticleService`/`ArticleRepository`) e um SELECT com embed de
 * `pdf_capture_regions` para recarregar o modal. Nunca reimplementa
 * `combineAreaExtractions`/etc — só persiste/lê o que o cliente decide.
 */

const ARTICLES_TABLE = "articles";

export interface CaptureRegionInput {
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  sortOrder?: number;
  extractedTitle?: string | null;
  extractedSubtitle?: string | null;
  extractedBody?: string | null;
  needsReview?: boolean;
  warnings?: string[];
}

export interface CaptureRegionRow {
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  sortOrder: number;
  extractedTitle: string | null;
  extractedSubtitle: string | null;
  extractedBody: string | null;
  needsReview: boolean;
  warnings: string[];
}

export interface CaptureDraftSummary {
  articleId: string;
  updatedAt: string;
}

export interface CaptureStateResult {
  applied: boolean;
  updatedAt: string;
}

export interface CaptureDraftWithRegions {
  articleId: string;
  title: string;
  subtitle: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  regions: CaptureRegionRow[];
}

function toRegionPayload(regions: CaptureRegionInput[]): Record<string, unknown>[] {
  return regions.map((region, index) => ({
    page: region.page,
    rect: region.rect,
    sortOrder: region.sortOrder ?? index,
    extractedTitle: region.extractedTitle ?? null,
    extractedSubtitle: region.extractedSubtitle ?? null,
    extractedBody: region.extractedBody ?? null,
    needsReview: region.needsReview ?? false,
    warnings: region.warnings ?? [],
  }));
}

export async function createPdfCaptureDraftSupabase(
  client: SupabaseClient,
  input: {
    editionId: string;
    page: number;
    title: string;
    subtitle: string | null;
    body: string;
    clientCaptureId: string;
    regions: CaptureRegionInput[];
  },
): Promise<CaptureDraftSummary> {
  const { data, error } = await client.rpc("save_pdf_capture_draft", {
    p_edition_id: input.editionId,
    p_page: input.page,
    p_title: input.title,
    p_subtitle: input.subtitle,
    p_body: input.body,
    p_client_capture_id: input.clientCaptureId,
    p_regions: toRegionPayload(input.regions),
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { article_id?: string; article_updated_at?: string } | null;
  if (!row?.article_id) throw new Error("Não foi possível salvar a matéria capturada.");
  return { articleId: row.article_id, updatedAt: row.article_updated_at ?? new Date().toISOString() };
}

export async function savePdfCaptureStateSupabase(
  client: SupabaseClient,
  input: {
    articleId: string;
    expectedUpdatedAt: string;
    title: string;
    subtitle: string | null;
    body: string;
    needsReview: boolean;
    regions: CaptureRegionInput[];
  },
): Promise<CaptureStateResult> {
  const { data, error } = await client.rpc("save_pdf_capture_state", {
    p_article_id: input.articleId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_title: input.title,
    p_subtitle: input.subtitle,
    p_body: input.body,
    p_needs_review: input.needsReview,
    p_regions: toRegionPayload(input.regions),
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { applied?: boolean; article_updated_at?: string } | null;
  if (!row) throw new Error("Não foi possível salvar a captura.");
  return { applied: row.applied === true, updatedAt: row.article_updated_at ?? input.expectedUpdatedAt };
}

interface CaptureDraftRow {
  id: string;
  title: string;
  subtitle: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  pdf_capture_regions: Array<{
    page: number;
    rect_x: number | string;
    rect_y: number | string;
    rect_width: number | string;
    rect_height: number | string;
    sort_order: number;
    extracted_title: string | null;
    extracted_subtitle: string | null;
    extracted_body: string | null;
    needs_review: boolean;
    warnings: string[] | null;
  }> | null;
}

export async function listPdfCaptureDraftsForEditionSupabase(
  client: SupabaseClient,
  editionId: string,
): Promise<CaptureDraftWithRegions[]> {
  const { data, error } = await client
    .from(ARTICLES_TABLE)
    .select(
      "id, title, subtitle, body, created_at, updated_at, pdf_capture_regions(page, rect_x, rect_y, rect_width, rect_height, sort_order, extracted_title, extracted_subtitle, extracted_body, needs_review, warnings)",
    )
    .eq("newspaper_edition_id", editionId)
    .eq("origin", "pdf")
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as CaptureDraftRow[]).map((row) => ({
    articleId: row.id,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    regions: [...(row.pdf_capture_regions ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({
        page: r.page,
        rect: { x: Number(r.rect_x), y: Number(r.rect_y), width: Number(r.rect_width), height: Number(r.rect_height) },
        sortOrder: r.sort_order,
        extractedTitle: r.extracted_title,
        extractedSubtitle: r.extracted_subtitle,
        extractedBody: r.extracted_body,
        needsReview: r.needs_review,
        warnings: r.warnings ?? [],
      })),
  }));
}
