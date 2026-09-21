"use server";

import { revalidatePath } from "next/cache";
import type { MediaAsset } from "@ir/types";
import { getMediaAssetService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { registerUploadedMediaAsset } from "../../../../providers/supabase/mediaAssetRepository.supabase";
import { InvalidImageUploadError, uploadImageToArticleMediaBucket } from "../../../../providers/supabase/mediaStorage.supabase";

const LIST_PATH = "/sistema/editorial/midias";

type ActionResult = { error: string } | { ok: true; asset: MediaAsset };
type UploadResult = { error: string } | { ok: true; assets: MediaAsset[]; warnings: string[] };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a mídia.";
}

export interface MediaAssetPayload {
  name: string;
  url: string;
  altText?: string;
  caption?: string;
  credit?: string;
  capturedAt?: string;
}

function validate(payload: MediaAssetPayload): string | null {
  if (!payload.name.trim()) return "Informe um nome para a mídia.";
  if (!payload.url.trim()) return "Informe a URL da imagem (sem storage real nesta fase).";
  return null;
}

export async function registerMedia(payload: MediaAssetPayload): Promise<ActionResult> {
  const validationError = validate(payload);
  if (validationError) return { error: validationError };
  try {
    const asset = await getMediaAssetService(createSupabaseServerClient()).register(payload);
    revalidatePath(LIST_PATH);
    return { ok: true, asset };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateMedia(id: string, payload: MediaAssetPayload): Promise<ActionResult> {
  const validationError = validate(payload);
  if (validationError) return { error: validationError };
  try {
    const asset = await getMediaAssetService(createSupabaseServerClient()).update(id, payload);
    revalidatePath(LIST_PATH);
    return { ok: true, asset };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * Upload real (Storage) + cadastro automático na biblioteca — usado pelo
 * botão "Enviar fotos" tanto na tela de Mídias quanto no editor de
 * matéria. Cada arquivo é validado (tipo/tamanho) e enviado individualmente;
 * uma falha num arquivo não derruba os demais — o resultado sempre reflete
 * exatamente o que foi (ou não) cadastrado.
 */
export async function uploadMediaAssets(formData: FormData): Promise<UploadResult> {
  const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) return { error: "Selecione ao menos um arquivo." };

  const client = createSupabaseServerClient();
  const assets: MediaAsset[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const { storagePath, publicUrl } = await uploadImageToArticleMediaBucket(client, file);
      const asset = await registerUploadedMediaAsset(client, {
        title: file.name.replace(/\.[^.]+$/, "") || "Foto",
        storagePath,
        publicUrl,
        fileName: file.name,
        mimeType: file.type,
      });
      assets.push(asset);
    } catch (error) {
      const message = error instanceof InvalidImageUploadError ? error.message : toErrorMessage(error);
      errors.push(`${file.name}: ${message}`);
    }
  }

  if (assets.length === 0) {
    return { error: errors.join(" ") || "Não foi possível enviar as fotos." };
  }
  revalidatePath(LIST_PATH);
  return { ok: true, assets, warnings: errors };
}
