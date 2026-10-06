import type { NfseDraft } from "@ir/types";

export type NewDraftRecord = Omit<NfseDraft, "id" | "reference" | "createdByProfileId" | "updatedByProfileId" | "createdAt" | "updatedAt">;
export type DraftChanges = Partial<NewDraftRecord>;

export class DraftValidationError extends Error {}

export interface DraftListQuery {
  clientId?: string;
}

/** Deliberadamente SEM método de exclusão — mesmo princípio de
 * ReceivableRepository/ContractRepository: nada neste módulo some, só
 * muda de estado (e nesta fase o único estado é "draft"). */
export interface DraftRepository {
  list(query?: DraftListQuery): Promise<NfseDraft[]>;
  getById(id: string): Promise<NfseDraft | null>;
  create(record: NewDraftRecord): Promise<NfseDraft>;
  update(id: string, changes: DraftChanges): Promise<NfseDraft>;
}
