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

interface PublicSlotRow {
  slot_number: number;
  active: boolean;
  rotation_interval_ms: number;
  transition_effect: SiteAdSlotTransitionEffect;
  fit_mode: SiteAdFitMode;
  has_media: boolean;
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

function fallbackForSlot(slotNumber: number, config: PublicSlotRow): PublicSiteAdMedia[] {
  const slot = FALLBACK_AD_SLOTS[slotNumber - 1];
  if (!slot) return [];
  return slot.creatives.map((creative, order) => ({
    slotNumber,
    id: creative.id,
    imageUrl: creative.imageUrl,
    altText: creative.alt,
    href: creative.href,
    sortOrder: order,
    rotationIntervalMs: config.rotation_interval_ms,
    transitionEffect: config.transition_effect,
    fitMode: config.fit_mode,
  }));
}

function buildEmergencyFallback(): Map<number, PublicSiteAdMedia[]> {
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

export async function getPublicSiteAds(): Promise<PublicSiteAds> {
  try {
    const supabase = getPublicSupabaseClient();
    const [slotsResult, mediaResult] = await Promise.all([
      supabase
        .from("public_site_ad_slots")
        .select("slot_number, active, rotation_interval_ms, transition_effect, fit_mode, has_media")
        .order("slot_number", { ascending: true }),
      supabase
        .from("public_site_ad_media")
        .select("slot_number, id, image_url, alt_text, href, sort_order, rotation_interval_ms, transition_effect, fit_mode"),
    ]);

    if (slotsResult.error) throw new Error(slotsResult.error.message);
    if (mediaResult.error) throw new Error(mediaResult.error.message);

    const slotRows = (slotsResult.data as PublicSlotRow[] | null) ?? [];
    const mediaRows = (mediaResult.data as MediaRow[] | null) ?? [];
    const mediaBySlot = new Map<number, PublicSiteAdMedia[]>();

    for (const config of slotRows) {
      if (!config.active) {
        mediaBySlot.set(config.slot_number, []);
        continue;
      }

      const configuredMedia = mediaRows
        .filter((row) => row.slot_number === config.slot_number)
        .map((row) => ({
          slotNumber: row.slot_number,
          id: row.id,
          imageUrl: row.image_url ?? "",
          altText: row.alt_text ?? undefined,
          href: row.href ?? undefined,
          sortOrder: row.sort_order,
          rotationIntervalMs: config.rotation_interval_ms,
          transitionEffect: config.transition_effect,
          fitMode: config.fit_mode,
        }));

      if (configuredMedia.length > 0) {
        mediaBySlot.set(config.slot_number, configuredMedia);
      } else if (!config.has_media) {
        // Transição: enquanto a posição ainda nunca recebeu mídia pelo
        // painel, preserva o anúncio legado. No primeiro upload ela passa
        // definitivamente a ser controlada pela playlist do banco.
        mediaBySlot.set(config.slot_number, fallbackForSlot(config.slot_number, config));
      } else {
        // Há mídia cadastrada, mas nenhuma está pública/ativa agora.
        mediaBySlot.set(config.slot_number, []);
      }
    }

    return { mediaBySlot };
  } catch {
    // Falha real de leitura do banco: mantém o portal com os anúncios
    // legados em vez de deixar as laterais vazias.
    return { mediaBySlot: buildEmergencyFallback() };
  }
}
