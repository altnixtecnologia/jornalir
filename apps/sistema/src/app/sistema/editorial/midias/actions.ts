"use server";

import { revalidatePath } from "next/cache";
import type { MediaAsset } from "@ir/types";
import { mediaAssetService } from "../../../../composition/editorial";

const LIST_PATH = "/sistema/editorial/midias";

type ActionResult = { error: string } | { ok: true; asset: MediaAsset };

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
    const asset = await mediaAssetService.register(payload);
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
    const asset = await mediaAssetService.update(id, payload);
    revalidatePath(LIST_PATH);
    return { ok: true, asset };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
