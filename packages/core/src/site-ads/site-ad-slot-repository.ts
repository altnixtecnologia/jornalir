import type { SiteAdMedia, SiteAdSlotWithMedia } from "@ir/types";

export type NewSiteAdMediaRecord = Omit<SiteAdMedia, "id" | "createdByProfileId" | "createdAt" | "updatedAt">;
export type SiteAdMediaChanges = Partial<Pick<SiteAdMedia, "clientId" | "href" | "altText" | "active" | "activeFrom" | "activeUntil" | "sortOrder">>;

export class SiteAdSlotNotFoundError extends Error {
  constructor(id: string) {
    super(`Posição de publicidade não encontrada: ${id}`);
  }
}
export class SiteAdMediaNotFoundError extends Error {
  constructor(id: string) {
    super(`Mídia de publicidade não encontrada: ${id}`);
  }
}

/**
 * As 6 posições são FIXAS (seed único na migration) — este repository
 * nunca cria/remove slot, só lista/ativa-desativa. Mídia dentro de um
 * slot (playlist) tem CRUD completo — adicionar/remover é operação
 * normal e reversível.
 */
export interface SiteAdSlotRepository {
  listWithMedia(): Promise<SiteAdSlotWithMedia[]>;
  setSlotActive(slotId: string, active: boolean): Promise<void>;
  addMedia(record: NewSiteAdMediaRecord): Promise<SiteAdMedia>;
  updateMedia(id: string, changes: SiteAdMediaChanges): Promise<SiteAdMedia>;
  removeMedia(id: string): Promise<void>;
  /** Grava a nova ordem (array de ids na ordem final) — mesmo princípio de moveItem usado em outros módulos, nunca reordenação parcial inconsistente. */
  reorderMedia(slotId: string, orderedMediaIds: string[]): Promise<void>;
}
