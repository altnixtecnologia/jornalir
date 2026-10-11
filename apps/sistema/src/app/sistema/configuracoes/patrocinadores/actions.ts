"use server";

import { revalidatePath } from "next/cache";
import type { SiteAdTransitionEffect } from "@ir/types";
import { getSiteAdSettingsService, getSiteAdSlotService } from "../../../../composition/siteAds";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const LIST_PATH = "/sistema/configuracoes/patrocinadores";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export async function updateSiteAdSettingsAction(id: string, rotationIntervalMs: number, transitionEffect: SiteAdTransitionEffect): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSettingsService(client).update(id, { rotationIntervalMs, transitionEffect });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function toggleSiteAdSlotActiveAction(slotId: string, active: boolean): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSlotService(client).setSlotActive(slotId, active);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export interface SiteAdMediaFormInput {
  clientId: string;
  href: string;
  altText: string;
  activeFrom: string;
  activeUntil: string;
}

/** Imagem já enviada (ver uploadMediaAssets, reaproveitado do módulo Mídias) — aqui só vincula o media_asset_id já existente ao slot, na próxima posição da playlist. */
export async function addSiteAdMediaAction(slotId: string, mediaAssetId: string, nextSortOrder: number, input: SiteAdMediaFormInput): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSlotService(client).addMedia(
      {
        slotId,
        mediaAssetId,
        clientId: input.clientId || undefined,
        href: input.href || undefined,
        altText: input.altText || undefined,
        activeFrom: input.activeFrom || undefined,
        activeUntil: input.activeUntil || undefined,
      },
      nextSortOrder,
    );
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function updateSiteAdMediaAction(id: string, input: SiteAdMediaFormInput & { active: boolean }): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSlotService(client).updateMedia(id, {
      clientId: input.clientId || undefined,
      href: input.href || undefined,
      altText: input.altText || undefined,
      active: input.active,
      activeFrom: input.activeFrom || undefined,
      activeUntil: input.activeUntil || undefined,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function removeSiteAdMediaAction(id: string): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSlotService(client).removeMedia(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function reorderSiteAdMediaAction(slotId: string, orderedMediaIds: string[]): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSlotService(client).reorderMedia(slotId, orderedMediaIds);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}
