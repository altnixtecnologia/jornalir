import type { NfseCancellationRequest } from "@ir/types";

export type NewCancellationRequestRecord = Omit<NfseCancellationRequest, "id" | "createdAt" | "status" | "requestedAt"> & {
  requestedByProfileId?: string;
};

/** Deliberadamente SEM update genérico — mesmo princípio de
 * TransmissionAttemptRepository: o histórico de solicitações nunca é
 * editado depois; um novo resultado é sempre uma linha nova. */
export interface CancellationRequestRepository {
  listByIssuedNoteId(issuedNoteId: string): Promise<NfseCancellationRequest[]>;
  getActiveByIssuedNoteId(issuedNoteId: string): Promise<NfseCancellationRequest | null>;
  create(record: NewCancellationRequestRecord): Promise<NfseCancellationRequest>;
}
