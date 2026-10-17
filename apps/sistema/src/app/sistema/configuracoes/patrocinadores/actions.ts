"use server";

import { revalidatePath } from "next/cache";
import type { SiteAdFitMode, SiteAdSlotTransitionEffect } from "@ir/types";
import { getSiteAdSlotService } from "../../../../composition/siteAds";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { registerUploadedMediaAsset } from "../../../../providers/supabase/mediaAssetRepository.supabase";
import {
  InvalidImageUploadError,
  uploadSiteAdImageToR2,
} from "../../../../providers/r2/mediaStorage.r2";

const LIST_PATH = "/sistema/configuracoes/patrocinadores";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export async function updateSiteAdSlotSettingsAction(
  slotId: string,
  rotationIntervalMs: number,
  transitionEffect: SiteAdSlotTransitionEffect,
  fitMode: SiteAdFitMode,
): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSlotService(client).updateSlotSettings(slotId, {
      rotationIntervalMs,
      transitionEffect,
      fitMode,
    });
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

export async function uploadSiteAdImagesAction(
  slotId: string,
  nextSortOrder: number,
  formData: FormData,
): Promise<{ error: string } | { ok: true; count: number; warnings: string[] }> {
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) return { error: "Selecione ao menos uma imagem." };
  if (files.length > 20) return { error: "Envie no máximo 20 imagens por vez." };

  const client = createSupabaseServerClient();
  const slotService = getSiteAdSlotService(client);
  const warnings: string[] = [];
  let count = 0;

  for (const file of files) {
    try {
      const uploaded = await uploadSiteAdImageToR2(file);
      const asset = await registerUploadedMediaAsset(client, {
        title: file.name.replace(/\.[^.]+$/, "") || "Publicidade",
        storagePath: uploaded.storagePath,
        publicUrl: uploaded.publicUrl,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        width: uploaded.width,
        height: uploaded.height,
      });
      await slotService.addMedia({ slotId, mediaAssetId: asset.id }, nextSortOrder + count);
      count += 1;
    } catch (error) {
      const message = error instanceof InvalidImageUploadError ? error.message : toErrorMessage(error);
      warnings.push(file.name + ": " + message);
    }
  }

  if (count === 0) return { error: warnings.join(" ") || "Não foi possível enviar as imagens." };
  revalidatePath(LIST_PATH);
  return { ok: true, count, warnings };
}

export async function updateSiteAdMediaSettingsAction(
  id: string,
  changes: { rotationIntervalMs: number | null; transitionEffect: SiteAdSlotTransitionEffect | null; fitMode: SiteAdFitMode | null },
): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    await getSiteAdSlotService(client).updateMedia(id, changes);
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
