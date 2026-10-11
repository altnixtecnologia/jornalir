import type { PublicSiteAdMedia, PublicSiteAdSettings, SiteAdTransitionEffect } from "@ir/types";
import { getPublicSupabaseClient } from "./supabasePublicClient";
import { adSlots as FALLBACK_AD_SLOTS } from "../../components/site/adSlots";

export interface PublicSiteAds {
  settings: PublicSiteAdSettings;
  mediaBySlot: Map<number, PublicSiteAdMedia[]>;
}

const FALLBACK_SETTINGS: PublicSiteAdSettings = { rotationIntervalMs: 10000, transitionEffect: "fade" };

/** Mesmas 6 artes do array hardcoded original — usado SÓ como rede de segurança (banco indisponível/sem dado nenhum), nunca como fonte normal. */
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
      })),
    );
  });
  return map;
}

interface SettingsRow {
  rotation_interval_ms: number;
  transition_effect: SiteAdTransitionEffect;
}

interface MediaRow {
  slot_number: number;
  id: string;
  image_url: string | null;
  alt_text: string | null;
  href: string | null;
  sort_order: number;
}

/**
 * Patrocinadores do site — lê as views públicas (public_site_ad_settings/
 * public_site_ad_media, RLS staff-only nas tabelas-base, mesmo princípio
 * de public_articles). NUNCA derruba a home: qualquer falha ou ausência
 * total de dados cai no fallback (mesmas 6 artes que já existiam antes
 * desta integração) — "sem dado real" nunca é tratado como erro fatal.
 */
export async function getPublicSiteAds(): Promise<PublicSiteAds> {
  try {
    const supabase = getPublicSupabaseClient();
    const [{ data: settingsRows, error: settingsError }, { data: mediaRows, error: mediaError }] = await Promise.all([
      supabase.from("public_site_ad_settings").select("rotation_interval_ms, transition_effect").limit(1),
      supabase.from("public_site_ad_media").select("slot_number, id, image_url, alt_text, href, sort_order"),
    ]);
    if (settingsError) throw new Error(settingsError.message);
    if (mediaError) throw new Error(mediaError.message);

    const settingsRow = (settingsRows as SettingsRow[] | null)?.[0];
    const rows = (mediaRows as MediaRow[] | null) ?? [];

    if (!settingsRow || rows.length === 0) {
      return { settings: FALLBACK_SETTINGS, mediaBySlot: buildFallbackMediaBySlot() };
    }

    const mediaBySlot = new Map<number, PublicSiteAdMedia[]>();
    for (const row of rows) {
      const list = mediaBySlot.get(row.slot_number) ?? [];
      list.push({ slotNumber: row.slot_number, id: row.id, imageUrl: row.image_url ?? "", altText: row.alt_text ?? undefined, href: row.href ?? undefined, sortOrder: row.sort_order });
      mediaBySlot.set(row.slot_number, list);
    }

    return {
      settings: { rotationIntervalMs: settingsRow.rotation_interval_ms, transitionEffect: settingsRow.transition_effect },
      mediaBySlot,
    };
  } catch {
    // Banco indisponível/configuração ausente — nunca derruba a home.
    return { settings: FALLBACK_SETTINGS, mediaBySlot: buildFallbackMediaBySlot() };
  }
}
