import type {
  PublicSiteAdMedia,
  SiteAdFitMode,
  SiteAdSlotTransitionEffect,
} from "@ir/types";
import { getPublicSupabaseClient } from "./supabasePublicClient";
import { adSlots as FALLBACK_AD_SLOTS } from "../../components/site/adSlots";

export interface PublicSiteAds {
  mediaBySlot: Map<number, PublicSiteAdMedia[]>;
}

function buildFallbackMediaBySlot(): Map<number, PublicSiteAdMedia[]> {
  const map = new Map<number, PublicSiteAdMedia[]>();
  FALLBACK_AD_SLOTS.forEach((slot, index) => {
    map.set(
      index + 1,
      slot.creatives.map((creative, order) => ({
        slotNumber: index + 1,
        id: creative.id,
        imageUrl: creative.imageUrl,
        altText: creative.alt,
        href: creative.href,
        sortOrder: order,
        rotationIntervalMs: slot.rotateMs,
        transitionEffect: slot.transitionEffect,
        fitMode: slot.fitMode,
      })),
    );
  });
  return map;
}

interface MediaRow {
  slot_number: number;
  id: string;
  image_url: string | null;
  alt_text: string | null;
  href: string | null;
  sort_order: number;
  rotation_interval_ms: number;
  transition_effect: SiteAdSlotTransitionEffect;
  fit_mode: SiteAdFitMode;
}

export async function getPublicSiteAds(): Promise<PublicSiteAds> {
  try {
    const supabase = getPublicSupabaseClient();
    const { data, error } = await supabase
      .from("public_site_ad_media")
      .select("slot_number, id, image_url, alt_text, href, sort_order, rotation_interval_ms, transition_effect, fit_mode");
    if (error) throw new Error(error.message);

    const rows = (data as MediaRow[] | null) ?? [];
    // Banco respondeu normalmente e não há publicidade ativa: respeita o
    // painel (inclusive posições desativadas) e não ressuscita mocks antigos.
    if (rows.length === 0) return { mediaBySlot: new Map() };

    const mediaBySlot = new Map<number, PublicSiteAdMedia[]>();
    for (const row of rows) {
      const list = mediaBySlot.get(row.slot_number) ?? [];
      list.push({
        slotNumber: row.slot_number,
        id: row.id,
        imageUrl: row.image_url ?? "",
        altText: row.alt_text ?? undefined,
        href: row.href ?? undefined,
        sortOrder: row.sort_order,
        rotationIntervalMs: row.rotation_interval_ms,
        transitionEffect: row.transition_effect,
        fitMode: row.fit_mode,
      });
      mediaBySlot.set(row.slot_number, list);
    }
    return { mediaBySlot };
  } catch {
    return { mediaBySlot: buildFallbackMediaBySlot() };
  }
}
