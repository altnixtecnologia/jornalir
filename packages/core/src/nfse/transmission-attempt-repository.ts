import type { NfseTransmissionAttempt } from "@ir/types";

export type NewTransmissionAttemptRecord = Omit<NfseTransmissionAttempt, "id" | "createdByProfileId" | "createdAt">;

/** Deliberadamente SEM update/delete — uma tentativa registrada nunca
 * é editada depois; uma tentativa posterior é sempre uma linha nova
 * (item 11). */
export interface TransmissionAttemptRepository {
  listByDraftId(draftId: string): Promise<NfseTransmissionAttempt[]>;
  create(record: NewTransmissionAttemptRecord): Promise<NfseTransmissionAttempt>;
}
