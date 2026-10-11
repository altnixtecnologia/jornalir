import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteAdMedia, SiteAdSettings, SiteAdSlotWithMedia, SiteAdTransitionEffect } from "@ir/types";
import type {
  NewSiteAdMediaRecord,
  SiteAdMediaChanges,
  SiteAdSettingsChanges,
  SiteAdSettingsRepository,
  SiteAdSlotRepository,
} from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const SETTINGS_TABLE = "site_ad_settings";
const SLOTS_TABLE = "site_ad_slots";
const MEDIA_TABLE = "site_ad_media";

interface SettingsRow {
  id: string;
  rotation_interval_ms: number;
  transition_effect: SiteAdTransitionEffect;
  created_at: string;
  updated_at: string;
}

function settingsToDomain(row: SettingsRow): SiteAdSettings {
  return {
    id: row.id,
    rotationIntervalMs: row.rotation_interval_ms,
    transitionEffect: row.transition_effect,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PREVIEW_SETTINGS: SiteAdSettings = {
  id: "preview-site-ad-settings",
  rotationIntervalMs: 10000,
  transitionEffect: "fade",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

export function createSiteAdSettingsRepositorySupabase(client: SupabaseClient): SiteAdSettingsRepository {
  return {
    async getCurrent() {
      if (isLocalPreviewEnabled()) return PREVIEW_SETTINGS;
      const { data, error } = await client.from(SETTINGS_TABLE).select("id, rotation_interval_ms, transition_effect, created_at, updated_at").order("updated_at", { ascending: false }).limit(1).single();
      if (error) throw new Error(error.message);
      return settingsToDomain(data as unknown as SettingsRow);
    },

    async update(id, changes: SiteAdSettingsChanges) {
      if (isLocalPreviewEnabled()) {
        Object.assign(PREVIEW_SETTINGS, changes, { updatedAt: new Date().toISOString() });
        return PREVIEW_SETTINGS;
      }
      const row: Record<string, unknown> = {};
      if (changes.rotationIntervalMs !== undefined) row.rotation_interval_ms = changes.rotationIntervalMs;
      if (changes.transitionEffect !== undefined) row.transition_effect = changes.transitionEffect;
      const { data, error } = await client.from(SETTINGS_TABLE).update(row).eq("id", id).select("id, rotation_interval_ms, transition_effect, created_at, updated_at").single();
      if (error) throw new Error(error.message);
      return settingsToDomain(data as unknown as SettingsRow);
    },
  };
}

interface SlotRow {
  id: string;
  slot_number: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface MediaRow {
  id: string;
  slot_id: string;
  media_asset_id: string;
  client_id: string | null;
  href: string | null;
  alt_text: string | null;
  active: boolean;
  active_from: string | null;
  active_until: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  media_assets: { public_url: string | null; alt_text: string | null } | null;
  clients: { kind: "individual" | "company"; full_name: string | null; company_name: string | null; trade_name: string | null } | null;
}

function clientNameFromEmbedded(row: MediaRow): string | undefined {
  if (!row.clients) return undefined;
  return row.clients.kind === "company" ? row.clients.trade_name || row.clients.company_name || undefined : row.clients.full_name || undefined;
}

function mediaToDomain(row: MediaRow): SiteAdMedia & { imageUrl: string; mediaAssetAltText?: string; clientName?: string } {
  return {
    id: row.id,
    slotId: row.slot_id,
    mediaAssetId: row.media_asset_id,
    clientId: row.client_id ?? undefined,
    href: row.href ?? undefined,
    altText: row.alt_text ?? undefined,
    active: row.active,
    activeFrom: row.active_from ?? undefined,
    activeUntil: row.active_until ?? undefined,
    sortOrder: row.sort_order,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageUrl: row.media_assets?.public_url ?? "",
    mediaAssetAltText: row.media_assets?.alt_text ?? undefined,
    clientName: clientNameFromEmbedded(row),
  };
}

// Preview — reaproveita as artes estáticas REAIS já existentes em
// apps/site/public/uploads/anuncios (mesmas do site hoje), sem precisar
// de media_assets de verdade em preview. Slot 1 e 2 com múltiplas
// imagens (demonstra a playlist); slot 6 inativo (demonstra
// ativar/desativar slot inteiro); uma mídia com período
// (activeFrom/activeUntil) e uma com patrocinador (clientId).
const PREVIEW_SLOTS: SiteAdSlotWithMedia[] = [
  {
    id: "preview-slot-1",
    slotNumber: 1,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    media: [
      {
        id: "preview-ad-media-1a",
        slotId: "preview-slot-1",
        mediaAssetId: "preview-midia-anuncio-1a",
        clientId: "preview-cliente-2",
        clientName: "Empresa de Exemplo Ltda. (visualização local)",
        active: true,
        sortOrder: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/grande1/cresol.jpg",
        altText: "Anúncio de exemplo — Cresol",
      },
      {
        id: "preview-ad-media-1b",
        slotId: "preview-slot-1",
        mediaAssetId: "preview-midia-anuncio-1b",
        href: "https://example.invalid",
        active: true,
        activeFrom: "2026-10-01",
        activeUntil: "2026-12-31",
        sortOrder: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/grande1/graxa seguros.jpg",
        altText: "Anúncio de exemplo — Graxa Seguros (com link e período)",
      },
    ],
  },
  {
    id: "preview-slot-2",
    slotNumber: 2,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    media: [
      {
        id: "preview-ad-media-2a",
        slotId: "preview-slot-2",
        mediaAssetId: "preview-midia-anuncio-2a",
        active: true,
        sortOrder: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/grande2/godinho.jpg",
        altText: "Anúncio de exemplo — Godinho",
      },
      {
        id: "preview-ad-media-2b",
        slotId: "preview-slot-2",
        mediaAssetId: "preview-midia-anuncio-2b",
        active: true,
        sortOrder: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/grande2/DUDA MOTOS CAR.jpg",
        altText: "Anúncio de exemplo — Duda Motos",
      },
    ],
  },
  {
    id: "preview-slot-3",
    slotNumber: 3,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    media: [
      {
        id: "preview-ad-media-3a",
        slotId: "preview-slot-3",
        mediaAssetId: "preview-midia-anuncio-3a",
        active: true,
        sortOrder: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/grande3/souza.jpg",
        altText: "Anúncio de exemplo — Souza",
      },
    ],
  },
  {
    id: "preview-slot-4",
    slotNumber: 4,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    media: [
      {
        id: "preview-ad-media-4a",
        slotId: "preview-slot-4",
        mediaAssetId: "preview-midia-anuncio-4a",
        active: true,
        sortOrder: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/grande4/SEJOLAR.jpg",
        altText: "Anúncio de exemplo — Sejolar",
      },
    ],
  },
  {
    id: "preview-slot-5",
    slotNumber: 5,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    media: [
      {
        id: "preview-ad-media-5a",
        slotId: "preview-slot-5",
        mediaAssetId: "preview-midia-anuncio-5a",
        active: true,
        sortOrder: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/pequena1/p-assis brasil.jpg",
        altText: "Anúncio de exemplo — Assis Brasil",
      },
    ],
  },
  // slot-6 INATIVO de propósito — demonstra ativar/desativar o slot
  // inteiro (as mídias continuam cadastradas, só não aparecem no site).
  {
    id: "preview-slot-6",
    slotNumber: 6,
    active: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    media: [
      {
        id: "preview-ad-media-6a",
        slotId: "preview-slot-6",
        mediaAssetId: "preview-midia-anuncio-6a",
        active: true,
        sortOrder: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        imageUrl: "/uploads/anuncios/pequena2/p-Madecasa.jpg",
        altText: "Anúncio de exemplo — Madecasa (slot desativado)",
      },
    ],
  },
];

export function createSiteAdSlotRepositorySupabase(client: SupabaseClient): SiteAdSlotRepository {
  return {
    async listWithMedia() {
      if (isLocalPreviewEnabled()) return PREVIEW_SLOTS;
      const { data: slotRows, error: slotsError } = await client.from(SLOTS_TABLE).select("id, slot_number, active, created_at, updated_at").order("slot_number", { ascending: true });
      if (slotsError) throw new Error(slotsError.message);
      const { data: mediaRows, error: mediaError } = await client
        .from(MEDIA_TABLE)
        .select("id, slot_id, media_asset_id, client_id, href, alt_text, active, active_from, active_until, sort_order, created_by, created_at, updated_at, media_assets(public_url, alt_text), clients(kind, full_name, company_name, trade_name)")
        .order("sort_order", { ascending: true });
      if (mediaError) throw new Error(mediaError.message);

      const mediaBySlot = new Map<string, ReturnType<typeof mediaToDomain>[]>();
      for (const row of mediaRows ?? []) {
        const typed = row as unknown as MediaRow;
        const list = mediaBySlot.get(typed.slot_id) ?? [];
        list.push(mediaToDomain(typed));
        mediaBySlot.set(typed.slot_id, list);
      }

      return (slotRows ?? []).map((row) => {
        const typed = row as unknown as SlotRow;
        return {
          id: typed.id,
          slotNumber: typed.slot_number,
          active: typed.active,
          createdAt: typed.created_at,
          updatedAt: typed.updated_at,
          media: mediaBySlot.get(typed.id) ?? [],
        };
      });
    },

    async setSlotActive(slotId, active) {
      if (isLocalPreviewEnabled()) {
        const slot = PREVIEW_SLOTS.find((s) => s.id === slotId);
        if (!slot) throw new Error(`Posição não encontrada: ${slotId}`);
        slot.active = active;
        return;
      }
      const { error } = await client.from(SLOTS_TABLE).update({ active }).eq("id", slotId);
      if (error) throw new Error(error.message);
    },

    async addMedia(record: NewSiteAdMediaRecord) {
      if (isLocalPreviewEnabled()) {
        const slot = PREVIEW_SLOTS.find((s) => s.id === record.slotId);
        if (!slot) throw new Error(`Posição não encontrada: ${record.slotId}`);
        const media = {
          ...record,
          id: `preview-ad-media-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrl: "/uploads/anuncios/grande1/cresol.jpg",
        };
        slot.media.push(media);
        return media;
      }
      const { data, error } = await client
        .from(MEDIA_TABLE)
        .insert({
          slot_id: record.slotId,
          media_asset_id: record.mediaAssetId,
          client_id: record.clientId ?? null,
          href: record.href ?? null,
          alt_text: record.altText ?? null,
          active: record.active,
          active_from: record.activeFrom ?? null,
          active_until: record.activeUntil ?? null,
          sort_order: record.sortOrder,
        })
        .select("id, slot_id, media_asset_id, client_id, href, alt_text, active, active_from, active_until, sort_order, created_by, created_at, updated_at, media_assets(public_url, alt_text), clients(kind, full_name, company_name, trade_name)")
        .single();
      if (error) throw new Error(error.message);
      return mediaToDomain(data as unknown as MediaRow);
    },

    async updateMedia(id, changes: SiteAdMediaChanges) {
      if (isLocalPreviewEnabled()) {
        for (const slot of PREVIEW_SLOTS) {
          const index = slot.media.findIndex((m) => m.id === id);
          if (index !== -1) {
            slot.media[index] = { ...slot.media[index], ...changes, updatedAt: new Date().toISOString() };
            return slot.media[index];
          }
        }
        throw new Error(`Mídia não encontrada: ${id}`);
      }
      const row: Record<string, unknown> = {};
      if (changes.clientId !== undefined) row.client_id = changes.clientId ?? null;
      if (changes.href !== undefined) row.href = changes.href ?? null;
      if (changes.altText !== undefined) row.alt_text = changes.altText ?? null;
      if (changes.active !== undefined) row.active = changes.active;
      if (changes.activeFrom !== undefined) row.active_from = changes.activeFrom ?? null;
      if (changes.activeUntil !== undefined) row.active_until = changes.activeUntil ?? null;
      if (changes.sortOrder !== undefined) row.sort_order = changes.sortOrder;
      const { data, error } = await client
        .from(MEDIA_TABLE)
        .update(row)
        .eq("id", id)
        .select("id, slot_id, media_asset_id, client_id, href, alt_text, active, active_from, active_until, sort_order, created_by, created_at, updated_at, media_assets(public_url, alt_text), clients(kind, full_name, company_name, trade_name)")
        .single();
      if (error) throw new Error(error.message);
      return mediaToDomain(data as unknown as MediaRow);
    },

    async removeMedia(id) {
      if (isLocalPreviewEnabled()) {
        for (const slot of PREVIEW_SLOTS) {
          const index = slot.media.findIndex((m) => m.id === id);
          if (index !== -1) {
            slot.media.splice(index, 1);
            return;
          }
        }
        return;
      }
      const { error } = await client.from(MEDIA_TABLE).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },

    async reorderMedia(slotId, orderedMediaIds) {
      if (isLocalPreviewEnabled()) {
        const slot = PREVIEW_SLOTS.find((s) => s.id === slotId);
        if (!slot) return;
        slot.media.sort((a, b) => orderedMediaIds.indexOf(a.id) - orderedMediaIds.indexOf(b.id));
        slot.media.forEach((m, index) => (m.sortOrder = index));
        return;
      }
      for (let index = 0; index < orderedMediaIds.length; index += 1) {
        const { error } = await client.from(MEDIA_TABLE).update({ sort_order: index }).eq("id", orderedMediaIds[index]).eq("slot_id", slotId);
        if (error) throw new Error(error.message);
      }
    },
  };
}
