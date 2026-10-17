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
  /** Pré-checagem de idempotência (item explícito da Fase 5 — "evitar criar dois rascunhos para a mesma origem sem confirmação") — o índice único parcial em (origin_system, origin_type, origin_record_id) continua sendo a proteção autoritativa. */
  findByOrigin(originSystem: string, originType: string, originRecordId: string): Promise<NfseDraft | null>;
  create(record: NewDraftRecord): Promise<NfseDraft>;
  update(id: string, changes: DraftChanges): Promise<NfseDraft>;
  /** Mutex curto contra transmissão concorrente do MESMO rascunho (Item 5, Lote 2, Tarefa 4) — lança erro claro se já houver uma transmissão em andamento (ver migration 20261029100800). */
  claimForTransmission(id: string): Promise<void>;
  /** Libera o mutex — sempre chamado depois de registrar a tentativa, com sucesso ou erro. */
  releaseTransmissionClaim(id: string): Promise<void>;
}
