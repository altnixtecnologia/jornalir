import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ImportCandidate,
  ImportCandidateExtraction,
  ImportCandidateStatus,
  ImportExtractionMethod,
  ImportPageCoverage,
  ImportSourceBlock,
} from "@ir/types";
import type {
  ImportCandidateChanges,
  ImportCandidateFilters,
  ImportCandidateRepository,
  NewImportCandidateRecord,
} from "@ir/core";

const CANDIDATES_TABLE = "pdf_import_candidates";
const BATCHES_TABLE = "pdf_import_batches";

const CANDIDATE_COLUMNS =
  "id, newspaper_edition_id, page_number, suggested_title, suggested_subtitle, suggested_body, suggested_section_id, suggested_locality_id, suggested_media_ids, extraction_method, extraction_warnings, low_confidence_title, possible_continuation, possible_advertisement, page_coverage, source_blocks, page_width, page_height, status, created_article_id, merged_into_id, created_at";

interface CandidateRow {
  id: string;
  newspaper_edition_id: string;
  page_number: number | null;
  suggested_title: string | null;
  suggested_subtitle: string | null;
  suggested_body: string | null;
  suggested_section_id: string | null;
  suggested_locality_id: string | null;
  suggested_media_ids: string[];
  extraction_method: ImportExtractionMethod | null;
  extraction_warnings: string[];
  low_confidence_title: boolean;
  possible_continuation: boolean;
  possible_advertisement: boolean;
  page_coverage: ImportPageCoverage | null;
  source_blocks: ImportSourceBlock[];
  page_width: number | null;
  page_height: number | null;
  status: ImportCandidateStatus;
  created_article_id: string | null;
  merged_into_id: string | null;
  created_at: string;
}

/** `extraction` só existe quando o candidato veio de uma extração real (extraction_method preenchido) — ausente para um candidato criado manualmente (ex.: a segunda metade de um `split`). */
function extractionToDomain(row: CandidateRow): ImportCandidateExtraction | undefined {
  if (!row.extraction_method) return undefined;
  return {
    method: row.extraction_method,
    pageWidth: row.page_width ?? 0,
    pageHeight: row.page_height ?? 0,
    blocks: row.source_blocks ?? [],
    warnings: row.extraction_warnings ?? [],
    lowConfidenceTitle: row.low_confidence_title,
    possibleContinuation: row.possible_continuation,
    possibleAdvertisement: row.possible_advertisement,
    pageCoverage: row.page_coverage ?? {
      blocksFound: 0,
      blocksUsed: 0,
      orphanBlocks: 0,
      coverageByCount: 1,
      coverageByChars: 1,
    },
  };
}

function toDomain(row: CandidateRow): ImportCandidate {
  return {
    id: row.id,
    editionId: row.newspaper_edition_id,
    pageNumber: row.page_number ?? undefined,
    suggestedTitle: row.suggested_title ?? undefined,
    suggestedSubtitle: row.suggested_subtitle ?? undefined,
    suggestedBody: row.suggested_body ?? undefined,
    suggestedSectionId: row.suggested_section_id ?? undefined,
    suggestedLocalityId: row.suggested_locality_id ?? undefined,
    suggestedMediaAssetIds: row.suggested_media_ids ?? [],
    status: row.status,
    createdArticleId: row.created_article_id ?? undefined,
    mergedIntoId: row.merged_into_id ?? undefined,
    extraction: extractionToDomain(row),
    createdAt: row.created_at,
  };
}

function recordToRow(record: NewImportCandidateRecord) {
  return {
    newspaper_edition_id: record.editionId,
    page_number: record.pageNumber ?? null,
    suggested_title: record.suggestedTitle ?? null,
    suggested_subtitle: record.suggestedSubtitle ?? null,
    suggested_body: record.suggestedBody ?? null,
    suggested_section_id: record.suggestedSectionId ?? null,
    suggested_locality_id: record.suggestedLocalityId ?? null,
    suggested_media_ids: record.suggestedMediaAssetIds ?? [],
    extraction_method: record.extraction?.method ?? null,
    extraction_warnings: record.extraction?.warnings ?? [],
    low_confidence_title: record.extraction?.lowConfidenceTitle ?? false,
    possible_continuation: record.extraction?.possibleContinuation ?? false,
    possible_advertisement: record.extraction?.possibleAdvertisement ?? false,
    page_coverage: record.extraction?.pageCoverage ?? null,
    source_blocks: record.extraction?.blocks ?? [],
    page_width: record.extraction?.pageWidth ?? null,
    page_height: record.extraction?.pageHeight ?? null,
    status: record.status,
  };
}

export function createImportCandidateRepositorySupabase(client: SupabaseClient): ImportCandidateRepository {
  return {
    async list(filters?: ImportCandidateFilters) {
      let query = client.from(CANDIDATES_TABLE).select(CANDIDATE_COLUMNS).order("created_at", { ascending: true });
      if (filters?.editionId) query = query.eq("newspaper_edition_id", filters.editionId);
      if (filters?.status) query = query.eq("status", filters.status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as CandidateRow));
    },

    async getById(id: string) {
      const { data, error } = await client.from(CANDIDATES_TABLE).select(CANDIDATE_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as CandidateRow) : null;
    },

    async create(record: NewImportCandidateRecord) {
      // Candidato avulso (ex.: segunda metade de um `split`) — sem lote
      // próprio, aponta para um lote mínimo criado só para satisfazer a FK
      // obrigatória de `batch_id` (mesmo raciocínio de `createMany` abaixo).
      const { data: batch, error: batchError } = await client
        .from(BATCHES_TABLE)
        .insert({ newspaper_edition_id: record.editionId })
        .select("id")
        .single();
      if (batchError) throw new Error(batchError.message);

      const { data, error } = await client
        .from(CANDIDATES_TABLE)
        .insert({ ...recordToRow(record), batch_id: batch.id })
        .select(CANDIDATE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as CandidateRow);
    },

    async createMany(records: NewImportCandidateRecord[]) {
      if (records.length === 0) return [];

      // Um lote = uma extração (Fase 17). `NewImportCandidateRecord` não
      // carrega metadados do lote (nome do arquivo/contagem de páginas/
      // avisos gerais) — esses só existem no retorno de
      // `extractCandidatesFromPdf`, consumido diretamente pela Server
      // Action, nunca persistido. `pdf_import_batches` aqui existe só como
      // a FK obrigatória de agrupamento; `source_file_name`/`page_count`/
      // `warnings` ficam nulos/vazios (divergência documentada, não usada
      // por nenhuma tela).
      const { data: batch, error: batchError } = await client
        .from(BATCHES_TABLE)
        .insert({ newspaper_edition_id: records[0].editionId })
        .select("id")
        .single();
      if (batchError) throw new Error(batchError.message);

      const { data, error } = await client
        .from(CANDIDATES_TABLE)
        .insert(records.map((record) => ({ ...recordToRow(record), batch_id: batch.id })))
        .select(CANDIDATE_COLUMNS);
      if (error) throw new Error(error.message);
      return ((data ?? []) as CandidateRow[]).map(toDomain);
    },

    async update(id: string, changes: ImportCandidateChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.pageNumber !== undefined) patch.page_number = changes.pageNumber ?? null;
      if (changes.suggestedTitle !== undefined) patch.suggested_title = changes.suggestedTitle ?? null;
      if (changes.suggestedSubtitle !== undefined) patch.suggested_subtitle = changes.suggestedSubtitle ?? null;
      if (changes.suggestedBody !== undefined) patch.suggested_body = changes.suggestedBody ?? null;
      if (changes.suggestedSectionId !== undefined) patch.suggested_section_id = changes.suggestedSectionId ?? null;
      if (changes.suggestedLocalityId !== undefined) patch.suggested_locality_id = changes.suggestedLocalityId ?? null;
      if (changes.suggestedMediaAssetIds !== undefined) patch.suggested_media_ids = changes.suggestedMediaAssetIds;
      if (changes.status !== undefined) patch.status = changes.status;
      if (changes.createdArticleId !== undefined) patch.created_article_id = changes.createdArticleId ?? null;
      if (changes.mergedIntoId !== undefined) patch.merged_into_id = changes.mergedIntoId ?? null;

      const { data, error } = await client
        .from(CANDIDATES_TABLE)
        .update(patch)
        .eq("id", id)
        .select(CANDIDATE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as CandidateRow);
    },
  };
}
