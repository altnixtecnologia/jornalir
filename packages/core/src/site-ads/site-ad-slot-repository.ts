import type { SiteAdMedia, SiteAdSlot, SiteAdSlotWithMedia } from "@ir/types";

export type NewSiteAdMediaRecord = Omit<SiteAdMedia, "id" | "createdByProfileId" | "createdAt" | "updatedAt">;
export type SiteAdMediaChanges = Partial<Pick<SiteAdMedia, "clientId" | "href" | "altText" | "active" | "activeFrom" | "activeUntil" | "sortOrder">>;
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
