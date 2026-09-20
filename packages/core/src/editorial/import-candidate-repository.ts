import type { ImportCandidate, ImportCandidateStatus } from "@ir/types";

export interface ImportCandidateFilters {
  editionId?: string;
  status?: ImportCandidateStatus;
}

/** Dados de um novo candidato; id e createdAt são atribuídos pelo provider. */
export type NewImportCandidateRecord = Omit<ImportCandidate, "id" | "createdAt">;

export type ImportCandidateChanges = Partial<
  Omit<ImportCandidate, "id" | "editionId" | "createdAt">
>;

export interface ImportCandidateRepository {
  list(filters?: ImportCandidateFilters): Promise<ImportCandidate[]>;
  getById(id: string): Promise<ImportCandidate | null>;
  create(record: NewImportCandidateRecord): Promise<ImportCandidate>;
  createMany(records: NewImportCandidateRecord[]): Promise<ImportCandidate[]>;
  update(id: string, changes: ImportCandidateChanges): Promise<ImportCandidate>;
}
