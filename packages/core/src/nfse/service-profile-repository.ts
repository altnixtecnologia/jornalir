import type { NfseServiceProfile } from "@ir/types";

export type NewServiceProfileRecord = Omit<NfseServiceProfile, "id" | "createdByProfileId" | "updatedByProfileId" | "createdAt" | "updatedAt">;
export type ServiceProfileChanges = Partial<NewServiceProfileRecord>;

export class ServiceProfileValidationError extends Error {}

export interface ServiceProfileListQuery {
  activeOnly?: boolean;
}

/** Deliberadamente SEM método de exclusão — perfil já usado nunca pode
 * ser destruído (item 5: "evitar exclusão destrutiva de perfil já
 * utilizado"). A única forma de "remover" um perfil da lista de
 * seleção é desativá-lo (`active=false`), nunca apagar a linha. */
export interface ServiceProfileRepository {
  list(query?: ServiceProfileListQuery): Promise<NfseServiceProfile[]>;
  getById(id: string): Promise<NfseServiceProfile | null>;
  create(record: NewServiceProfileRecord): Promise<NfseServiceProfile>;
  update(id: string, changes: ServiceProfileChanges): Promise<NfseServiceProfile>;
}
