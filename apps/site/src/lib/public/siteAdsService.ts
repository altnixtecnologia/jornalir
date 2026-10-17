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
  managed_by_panel: boolean;
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
    // Acervo legado nunca teve configuração por imagem — usa sempre o padrão da posição.
    rotationIntervalMs: config.rotation_interval_ms,
    transitionEffect: config.transition_effect,
    fitMode: config.fit_mode,
  }));
}

export async function getPublicSiteAds(): Promise<PublicSiteAds> {
  try {
    const supabase = getPublicSupabaseClient();
    const [slotsResult, mediaResult] = await Promise.all([
      supabase
        .from("public_site_ad_slots")
        .select("slot_number, active, rotation_interval_ms, transition_effect, fit_mode, has_media, managed_by_panel")
        .order("slot_number", { ascending: true }),
      supabase
        .from("public_site_ad_media")
        .select("slot_number, id, image_url, alt_text, href, sort_order, rotation_interval_ms, transition_effect, fit_mode")
        .order("slot_number", { ascending: true })
        .order("sort_order", { ascending: true }),
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
          // public_site_ad_media já resolve o COALESCE imagem->posição — usar o valor da
          // própria linha, nunca o da posição direto (seria ignorar a configuração individual).
          rotationIntervalMs: row.rotation_interval_ms,
          transitionEffect: row.transition_effect,
          fitMode: row.fit_mode,
        }));

      if (configuredMedia.length > 0) {
        mediaBySlot.set(config.slot_number, configuredMedia);
      } else if (!config.managed_by_panel) {
        // Antes do primeiro upload, preserva os anuncios antigos. Depois
        // de gerenciada, a posicao nunca volta automaticamente ao legado.
        mediaBySlot.set(config.slot_number, fallbackForSlot(config.slot_number, config));
      } else {
        // Há mídia cadastrada, mas nenhuma está pública/ativa agora.
        mediaBySlot.set(config.slot_number, []);
      }
    }

    return { mediaBySlot };
  } catch {
    // Sem configuracao confiavel, nao ressuscitar anuncios antigos
    // que possam ter sido removidos ou desativados pelo painel.
    return { mediaBySlot: new Map() };
  }
}
