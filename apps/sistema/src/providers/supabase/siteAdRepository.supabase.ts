import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SiteAdFitMode,
  SiteAdMedia,
  SiteAdSettings,
  SiteAdSlotTransitionEffect,
  SiteAdSlotWithMedia,
  SiteAdTransitionEffect,
} from "@ir/types";
import type {
  NewSiteAdMediaRecord,
  SiteAdMediaChanges,
  SiteAdSettingsChanges,
  SiteAdSettingsRepository,
  SiteAdSlotChanges,
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
      const { data, error } = await client
        .from(SETTINGS_TABLE)
        .select("id, rotation_interval_ms, transition_effect, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
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
      const { data, error } = await client
        .from(SETTINGS_TABLE)
        .update(row)
        .eq("id", id)
        .select("id, rotation_interval_ms, transition_effect, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return settingsToDomain(data as unknown as SettingsRow);
    },
  };
}

interface SlotRow {
  id: string;
  slot_number: number;
  active: boolean;
  rotation_interval_ms: number;
  transition_effect: SiteAdSlotTransitionEffect;
  fit_mode: SiteAdFitMode;
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
  rotation_interval_ms: number | null;
  transition_effect: SiteAdSlotTransitionEffect | null;
  fit_mode: SiteAdFitMode | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  media_assets: { public_url: string | null; alt_text: string | null } | null;
}

const MEDIA_COLUMNS = "id, slot_id, media_asset_id, client_id, href, alt_text, active, active_from, active_until, sort_order, rotation_interval_ms, transition_effect, fit_mode, created_by, created_at, updated_at, media_assets(public_url, alt_text)";

function mediaToDomain(row: MediaRow): SiteAdMedia & { imageUrl: string; mediaAssetAltText?: string } {
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
    rotationIntervalMs: row.rotation_interval_ms ?? undefined,
    transitionEffect: row.transition_effect ?? undefined,
    fitMode: row.fit_mode ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageUrl: row.media_assets?.public_url ?? "",
    mediaAssetAltText: row.media_assets?.alt_text ?? undefined,
  };
}

const PREVIEW_SLOTS: SiteAdSlotWithMedia[] = Array.from({ length: 6 }, (_, index) => ({
  id: "preview-slot-" + (index + 1),
  slotNumber: index + 1,
  active: true,
  rotationIntervalMs: 10000,
  transitionEffect: "fade" as SiteAdSlotTransitionEffect,
  fitMode: "contain" as SiteAdFitMode,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  media: [],
}));

function slotChangesToRow(changes: SiteAdSlotChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (changes.active !== undefined) row.active = changes.active;
  if (changes.rotationIntervalMs !== undefined) row.rotation_interval_ms = changes.rotationIntervalMs;
  if (changes.transitionEffect !== undefined) row.transition_effect = changes.transitionEffect;
  if (changes.fitMode !== undefined) row.fit_mode = changes.fitMode;
  return row;
}

export function createSiteAdSlotRepositorySupabase(client: SupabaseClient): SiteAdSlotRepository {
  return {
    async listWithMedia() {
      if (isLocalPreviewEnabled()) return PREVIEW_SLOTS;
      const { data: slotRows, error: slotsError } = await client
        .from(SLOTS_TABLE)
        .select("id, slot_number, active, rotation_interval_ms, transition_effect, fit_mode, created_at, updated_at")
        .order("slot_number", { ascending: true });
      if (slotsError) throw new Error(slotsError.message);

      const { data: mediaRows, error: mediaError } = await client
        .from(MEDIA_TABLE)
        .select(MEDIA_COLUMNS)
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
          rotationIntervalMs: typed.rotation_interval_ms,
          transitionEffect: typed.transition_effect,
          fitMode: typed.fit_mode,
          createdAt: typed.created_at,
          updatedAt: typed.updated_at,
          media: mediaBySlot.get(typed.id) ?? [],
        };
      });
    },

    async setSlotActive(slotId, active) {
      if (isLocalPreviewEnabled()) {
        const slot = PREVIEW_SLOTS.find((item) => item.id === slotId);
        if (!slot) throw new Error("Posição não encontrada.");
        slot.active = active;
        return;
      }
      const { error } = await client.from(SLOTS_TABLE).update({ active }).eq("id", slotId);
      if (error) throw new Error(error.message);
    },

    async updateSlot(slotId, changes) {
      if (isLocalPreviewEnabled()) {
        const slot = PREVIEW_SLOTS.find((item) => item.id === slotId);
        if (!slot) throw new Error("Posição não encontrada.");
        Object.assign(slot, changes, { updatedAt: new Date().toISOString() });
        return;
      }
      const { error } = await client.from(SLOTS_TABLE).update(slotChangesToRow(changes)).eq("id", slotId);
      if (error) throw new Error(error.message);
    },

    async addMedia(record: NewSiteAdMediaRecord) {
      if (isLocalPreviewEnabled()) {
        const slot = PREVIEW_SLOTS.find((item) => item.id === record.slotId);
        if (!slot) throw new Error("Posição não encontrada.");
        const media = {
          ...record,
          id: "preview-ad-" + Date.now(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrl: "",
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
        .select(MEDIA_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return mediaToDomain(data as unknown as MediaRow);
    },

    async updateMedia(id, changes: SiteAdMediaChanges) {
      if (isLocalPreviewEnabled()) {
        for (const slot of PREVIEW_SLOTS) {
          const index = slot.media.findIndex((item) => item.id === id);
          if (index >= 0) {
            slot.media[index] = {
              ...slot.media[index],
              ...changes,
              rotationIntervalMs: changes.rotationIntervalMs === null ? undefined : changes.rotationIntervalMs ?? slot.media[index].rotationIntervalMs,
              transitionEffect: changes.transitionEffect === null ? undefined : changes.transitionEffect ?? slot.media[index].transitionEffect,
              fitMode: changes.fitMode === null ? undefined : changes.fitMode ?? slot.media[index].fitMode,
              updatedAt: new Date().toISOString(),
            };
            return slot.media[index];
          }
        }
        throw new Error("Mídia não encontrada.");
      }
      const row: Record<string, unknown> = {};
      if (changes.clientId !== undefined) row.client_id = changes.clientId ?? null;
      if (changes.href !== undefined) row.href = changes.href ?? null;
      if (changes.altText !== undefined) row.alt_text = changes.altText ?? null;
      if (changes.active !== undefined) row.active = changes.active;
      if (changes.activeFrom !== undefined) row.active_from = changes.activeFrom ?? null;
      if (changes.activeUntil !== undefined) row.active_until = changes.activeUntil ?? null;
      if (changes.sortOrder !== undefined) row.sort_order = changes.sortOrder;
      if (changes.rotationIntervalMs !== undefined) row.rotation_interval_ms = changes.rotationIntervalMs;
      if (changes.transitionEffect !== undefined) row.transition_effect = changes.transitionEffect;
      if (changes.fitMode !== undefined) row.fit_mode = changes.fitMode;
      const { data, error } = await client
        .from(MEDIA_TABLE)
        .update(row)
        .eq("id", id)
        .select(MEDIA_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return mediaToDomain(data as unknown as MediaRow);
    },

    async removeMedia(id) {
      if (isLocalPreviewEnabled()) {
        for (const slot of PREVIEW_SLOTS) {
          const index = slot.media.findIndex((item) => item.id === id);
          if (index >= 0) slot.media.splice(index, 1);
        }
        return;
      }
      const { error } = await client.from(MEDIA_TABLE).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },

    async reorderMedia(slotId, orderedMediaIds) {
      if (isLocalPreviewEnabled()) {
        const slot = PREVIEW_SLOTS.find((item) => item.id === slotId);
        if (!slot) return;
        slot.media.sort((a, b) => orderedMediaIds.indexOf(a.id) - orderedMediaIds.indexOf(b.id));
        slot.media.forEach((item, index) => { item.sortOrder = index; });
        return;
      }
      // Um unico RPC transacional: nao deixa a ordem pela metade se uma
      // imagem tiver sido removida ou outro editor alterar a lista.
      const { data: changed, error } = await client.rpc("reorder_site_ad_media", {
        p_slot_id: slotId,
        p_media_ids: orderedMediaIds,
      });
      if (error) throw new Error(error.message);
      if (changed !== orderedMediaIds.length) throw new Error("Não foi possível confirmar a ordem de todas as imagens.");
    },
  };
}
