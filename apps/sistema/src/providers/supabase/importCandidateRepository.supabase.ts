import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArticleMedia,
  ImportCandidate,
  ImportCandidateExtraction,
  ImportCandidateStatus,
  ImportExtractionMethod,
  ImportPageCoverage,
  ImportSourceBlock,
} from "@ir/types";
import type {
  ConvertCandidateAtomicInput,
  ImportBatchMetadata,
  ImportBatchSummary,
  ImportCandidateChanges,
  ImportCandidateFilters,
  ImportCandidateRepository,
  MergeCandidatesAtomicInput,
  NewImportCandidateRecord,
  SplitCandidateAtomicInput,
} from "@ir/core";

const CANDIDATES_TABLE = "pdf_import_candidates";
const BATCHES_TABLE = "pdf_import_batches";

const CANDIDATE_COLUMNS =
  "id, newspaper_edition_id, page_number, suggested_title, suggested_subtitle, suggested_body, suggested_section_id, suggested_locality_id, suggested_media_ids, extraction_method, extraction_warnings, low_confidence_title, possible_continuation, possible_advertisement, page_coverage, source_blocks, page_width, page_height, status, created_article_id, merged_into_id, split_from_id, created_at";

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
  split_from_id: string | null;
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
    splitFromId: row.split_from_id ?? undefined,
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

    // Chama a RPC create_pdf_import_batch (ver migration
    // 20261012100000_pdf_import_atomicity_and_safety.sql) — cria o batch
    // (com file_hash/metadados) e TODOS os candidatos na mesma transação.
    // Antes, eram dois INSERTs HTTP separados: se o dos candidatos
    // falhasse, sobrava um batch vazio com file_hash gravado, e
    // findBatchByHash() na próxima tentativa achava esse batch fantasma e
    // dizia "PDF já processado" com 0 candidatos reais. Agora, qualquer
    // falha desfaz os dois (o INSERT multi-linha de candidatos dentro da
    // RPC é atômico por natureza: ou todas as linhas entram, ou nenhuma).
    async createMany(records: NewImportCandidateRecord[], batchMeta?: ImportBatchMetadata) {
      if (records.length === 0) return [];

      const { data, error } = await client.rpc("create_pdf_import_batch", {
        p_newspaper_edition_id: records[0].editionId,
        p_source_file_name: batchMeta?.fileName ?? null,
        p_file_hash: batchMeta?.fileHash ?? null,
        p_page_count: batchMeta?.pageCount ?? null,
        p_pages_without_text: batchMeta?.pagesWithoutText ?? [],
        p_warnings: batchMeta?.warnings ?? [],
        p_candidates: records.map(recordToRow),
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as CandidateRow[]).map(toDomain);
    },

    /** Lote mais recente desta edição com este hash de arquivo — só pra
     * avisar reenvio, nunca bloqueia sozinho (ver generateCandidates). */
    async findBatchByHash(editionId: string, fileHash: string): Promise<ImportBatchSummary | null> {
      const { data: batchRow, error: batchError } = await client
        .from(BATCHES_TABLE)
        .select("id, source_file_name, created_at")
        .eq("newspaper_edition_id", editionId)
        .eq("file_hash", fileHash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (batchError) throw new Error(batchError.message);
      if (!batchRow) return null;

      const { count, error: countError } = await client
        .from(CANDIDATES_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchRow.id);
      if (countError) throw new Error(countError.message);

      return {
        batchId: batchRow.id,
        fileName: batchRow.source_file_name ?? undefined,
        createdAt: batchRow.created_at,
        candidateCount: count ?? 0,
      };
    },

    // convertToDraftAtomic/splitAtomic/mergeAtomic chamam RPCs transacionais
    // (ver migration 20261012100000_pdf_import_atomicity_and_safety.sql) —
    // nunca fazem a sequência de escritas separadas que existia antes.
    async convertToDraftAtomic(id: string, input: ConvertCandidateAtomicInput) {
      const { data, error } = await client.rpc("convert_import_candidate_to_draft", {
        p_candidate_id: id,
        p_title: input.title,
        p_subtitle: input.subtitle ?? null,
        p_body: input.body,
        p_section_id: input.sectionId,
        p_locality_id: input.localityId,
        p_page_number: input.pageNumber ?? null,
        p_media: input.media.map((m: ArticleMedia) => ({
          mediaAssetId: m.mediaAssetId,
          role: m.role,
          order: m.order,
          caption: m.caption ?? null,
          credit: m.credit ?? null,
        })),
      });
      if (error) throw new Error(error.message);
      return { articleId: data as string };
    },

    async splitAtomic(id: string, input: SplitCandidateAtomicInput) {
      const { data, error } = await client.rpc("split_import_candidate", {
        p_id: id,
        p_first_body: input.firstBody,
        p_second_title: input.secondTitle ?? null,
        p_second_body: input.secondBody,
      });
      if (error) throw new Error(error.message);
      const result = data as { firstId: string; secondId: string };
      return { firstId: result.firstId, secondId: result.secondId };
    },

    async mergeAtomic(primaryId: string, input: MergeCandidatesAtomicInput) {
      const { error } = await client.rpc("merge_import_candidates", {
        p_primary_id: primaryId,
        p_secondary_ids: input.secondaryIds,
        p_merged_body: input.mergedBody,
        p_merged_media_ids: input.mergedMediaAssetIds,
      });
      if (error) throw new Error(error.message);
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
