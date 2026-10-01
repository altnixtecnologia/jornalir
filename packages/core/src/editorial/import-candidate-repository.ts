import type { ArticleMedia, ImportCandidate, ImportCandidateStatus } from "@ir/types";

export interface ImportCandidateFilters {
  editionId?: string;
  status?: ImportCandidateStatus;
}

/** Dados de um novo candidato; id e createdAt são atribuídos pelo provider. */
export type NewImportCandidateRecord = Omit<ImportCandidate, "id" | "createdAt">;

export type ImportCandidateChanges = Partial<
  Omit<ImportCandidate, "id" | "editionId" | "createdAt">
>;

/** Metadados do lote (arquivo de origem) — opcional; quando ausente, o
 * provider grava um lote "mínimo" (mesmo comportamento de antes desta
 * correção). `fileHash` (SHA-256 hex) é o que permite detectar reenvio do
 * mesmo PDF pra mesma edição. */
export interface ImportBatchMetadata {
  fileName?: string;
  fileHash?: string;
  pageCount?: number;
  pagesWithoutText?: number[];
  warnings?: string[];
}

/** Resumo de um lote já existente — usado só pra avisar reenvio do mesmo
 * PDF, nunca pra bloquear (reprocessamento continua permitido, de forma
 * explícita). */
export interface ImportBatchSummary {
  batchId: string;
  fileName?: string;
  createdAt: string;
  candidateCount: number;
}

export interface ConvertCandidateAtomicInput {
  title: string;
  subtitle?: string;
  body: string;
  sectionId: string;
  localityId: string;
  pageNumber?: number;
  media: ArticleMedia[];
}

export interface SplitCandidateAtomicInput {
  firstBody: string;
  secondTitle?: string;
  secondBody: string;
}

export interface MergeCandidatesAtomicInput {
  secondaryIds: string[];
  mergedBody: string;
  mergedMediaAssetIds: string[];
}

export interface ImportCandidateRepository {
  list(filters?: ImportCandidateFilters): Promise<ImportCandidate[]>;
  getById(id: string): Promise<ImportCandidate | null>;
  create(record: NewImportCandidateRecord): Promise<ImportCandidate>;
  createMany(records: NewImportCandidateRecord[], batchMeta?: ImportBatchMetadata): Promise<ImportCandidate[]>;
  update(id: string, changes: ImportCandidateChanges): Promise<ImportCandidate>;

  /** Lote mais recente já processado pra esta edição com este hash de
   * arquivo (SHA-256 hex), se existir — usado pra avisar reenvio, nunca
   * pra bloquear automaticamente. */
  findBatchByHash(editionId: string, fileHash: string): Promise<ImportBatchSummary | null>;

  /** Cria a matéria-rascunho + vincula mídia + marca o candidato como
   * `converted`, tudo numa única transação (RPC `convert_import_candidate_to_draft`)
   * — nunca duas matérias pro mesmo candidato, mesmo em retry/duplo clique/
   * falha de rede no meio do caminho. */
  convertToDraftAtomic(id: string, input: ConvertCandidateAtomicInput): Promise<{ articleId: string }>;

  /** Atualiza a primeira metade + cria a segunda, na mesma transação (RPC
   * `split_import_candidate`) — se a criação da segunda falhar, a primeira
   * nunca é alterada. */
  splitAtomic(id: string, input: SplitCandidateAtomicInput): Promise<{ firstId: string; secondId: string }>;

  /** Marca todos os secundários como descartados/mesclados e atualiza o
   * principal, na mesma transação (RPC `merge_import_candidates`) — se
   * qualquer validação falhar (candidato não pendente, edição diferente),
   * nada é alterado. */
  mergeAtomic(primaryId: string, input: MergeCandidatesAtomicInput): Promise<void>;
}
