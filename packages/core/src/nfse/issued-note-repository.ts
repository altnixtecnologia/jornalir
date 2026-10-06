import type { NfseIssuedNote } from "@ir/types";

export type NewIssuedNoteRecord = Omit<NfseIssuedNote, "id" | "createdByProfileId" | "createdAt">;

export class IssuedNoteAlreadyExistsError extends Error {
  constructor(draftId: string) {
    super(`Este rascunho já tem uma NFS-e emitida (draft ${draftId}) — nunca duas autorizadas a partir do mesmo rascunho.`);
  }
}

/** Deliberadamente SEM update/delete — uma NFS-e emitida é um registro
 * histórico imutável (item 10). `draft_id` é UNIQUE no banco: a
 * proteção real contra duplicidade é a constraint, não só esta camada. */
export interface IssuedNoteRepository {
  listAll(): Promise<NfseIssuedNote[]>;
  getByDraftId(draftId: string): Promise<NfseIssuedNote | null>;
  getById(id: string): Promise<NfseIssuedNote | null>;
  create(record: NewIssuedNoteRecord): Promise<NfseIssuedNote>;
}
