import type { SiteAdFitMode, SiteAdMedia, SiteAdSlot, SiteAdSlotTransitionEffect, SiteAdSlotWithMedia } from "@ir/types";

export type NewSiteAdMediaRecord = Omit<SiteAdMedia, "id" | "createdByProfileId" | "createdAt" | "updatedAt">;
// rotationIntervalMs/transitionEffect/fitMode aceitam null explícito (volta a usar o valor da
// posição) além de undefined (não alterar) — por isso não usam Pick/Partial puro do domínio.
export type SiteAdMediaChanges = Partial<Pick<SiteAdMedia, "clientId" | "href" | "altText" | "active" | "activeFrom" | "activeUntil" | "sortOrder">> & {
  rotationIntervalMs?: number | null;
  transitionEffect?: SiteAdSlotTransitionEffect | null;
  fitMode?: SiteAdFitMode | null;
};
export type SiteAdSlotChanges = Partial<Pick<SiteAdSlot, "active" | "rotationIntervalMs" | "transitionEffect" | "fitMode">>;

export class SiteAdSlotNotFoundError extends Error {
  constructor(id: string) {
    super("Posição de publicidade não encontrada: " + id);
  }
}
export class SiteAdMediaNotFoundError extends Error {
  constructor(id: string) {
    super("Mídia de publicidade não encontrada: " + id);
  }
}

export interface SiteAdSlotRepository {
  listWithMedia(): Promise<SiteAdSlotWithMedia[]>;
  setSlotActive(slotId: string, active: boolean): Promise<void>;
  updateSlot(slotId: string, changes: SiteAdSlotChanges): Promise<void>;
  addMedia(record: NewSiteAdMediaRecord): Promise<SiteAdMedia>;
  updateMedia(id: string, changes: SiteAdMediaChanges): Promise<SiteAdMedia>;
  removeMedia(id: string): Promise<void>;
  reorderMedia(slotId: string, orderedMediaIds: string[]): Promise<void>;
}
