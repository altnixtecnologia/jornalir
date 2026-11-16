import type { SiteAdMediaWithAsset, SiteAdSlotWithMedia } from "@ir/types";

export interface SiteAdLibraryEntry {
  slot: SiteAdSlotWithMedia;
  media: SiteAdMediaWithAsset;
}

/** Apresentação única, sem regravar a origem das imagens antigas. */
export function buildSiteAdLibrary(slots: readonly SiteAdSlotWithMedia[]): {
  entries: SiteAdLibraryEntry[];
  uploadSlot: SiteAdSlotWithMedia | null;
} {
  const orderedSlots = [...slots].sort((a, b) => a.slotNumber - b.slotNumber);
  return {
    // Escolha interna e determinística; nenhum grupo precisa ser escolhido no painel.
    uploadSlot: orderedSlots.find((slot) => slot.active) ?? null,
    entries: orderedSlots.flatMap((slot) =>
      [...slot.media].sort((a, b) => a.sortOrder - b.sortOrder).map((media) => ({ slot, media })),
    ),
  };
}
