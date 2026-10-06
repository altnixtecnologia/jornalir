"use server";

import { revalidatePath } from "next/cache";
import type { NewspaperEdition } from "@ir/types";
import { getNewspaperEditionService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { attachEditionExternalPdf } from "../../../../providers/supabase/newspaperEditionRepository.supabase";
import {
  DriveArchiveNotConfiguredError,
  InvalidDriveEditionPdfError,
  uploadEditionPdfToDrive,
} from "../../../../lib/googleDrive/editionArchive";

const LIST_PATH = "/sistema/editorial/edicoes";

type ActionResult = { error: string } | { ok: true; edition: NewspaperEdition };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a edição.";
}

export interface NewspaperEditionPayload {
  editionNumber: string;
  title: string;
  publicationDate: string;
  pageCount: string;
}

function validate(payload: NewspaperEditionPayload): string | null {
  if (!payload.editionNumber.trim() || Number.isNaN(Number(payload.editionNumber))) {
    return "Informe o número da edição.";
  }
  if (!payload.publicationDate) {
    return "Informe a data de publicação.";
  }
  return null;
}

export async function createEdition(payload: NewspaperEditionPayload): Promise<ActionResult> {
  const validationError = validate(payload);
  if (validationError) return { error: validationError };
  try {
    const edition = await getNewspaperEditionService(createSupabaseServerClient()).create({
      editionNumber: Number(payload.editionNumber),
      title: payload.title,
      publicationDate: payload.publicationDate,
      pageCount: payload.pageCount ? Number(payload.pageCount) : undefined,
    });
    revalidatePath(LIST_PATH);
    revalidatePath("/sistema/editorial/importar-pdf");
    return { ok: true, edition };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateEdition(id: string, payload: NewspaperEditionPayload): Promise<ActionResult> {
  const validationError = validate(payload);
  if (validationError) return { error: validationError };
  try {
    const edition = await getNewspaperEditionService(createSupabaseServerClient()).update(id, {
      editionNumber: Number(payload.editionNumber),
      title: payload.title,
      publicationDate: payload.publicationDate,
      pageCount: payload.pageCount ? Number(payload.pageCount) : undefined,
    });
    revalidatePath(LIST_PATH);
    revalidatePath("/sistema/editorial/importar-pdf");
    return { ok: true, edition };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function setEditionActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const edition = await getNewspaperEditionService(createSupabaseServerClient()).setActive(id, active);
    revalidatePath(LIST_PATH);
    revalidatePath("/sistema/editorial/importar-pdf");
    return { ok: true, edition };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * PDF oficial da edição: novos arquivos vão para a pasta pública do Google
 * Drive que já alimenta o Jornal Online. O Supabase guarda somente a URL.
 * PDFs antigos já existentes no bucket privado continuam legíveis, mas
 * nenhum upload novo deste fluxo aumenta o Storage do Supabase.
 */
export async function uploadEditionPdfAction(editionId: string, formData: FormData): Promise<ActionResult> {
  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo PDF." };
  }

  const client = createSupabaseServerClient();
  try {
    const current = await getNewspaperEditionService(client).getById(editionId);
    if (!current) return { error: "Edição não encontrada." };

    const uploaded = await uploadEditionPdfToDrive(file, {
      editionNumber: current.editionNumber,
      publicationDate: current.publicationDate,
    });
    await attachEditionExternalPdf(client, editionId, uploaded.previewUrl);

    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return { error: "Edição não encontrada após o upload." };
    revalidatePath(LIST_PATH);
    revalidatePath("/sistema/editorial/importar-pdf");
    return { ok: true, edition };
  } catch (error) {
    const message =
      error instanceof DriveArchiveNotConfiguredError || error instanceof InvalidDriveEditionPdfError
        ? error.message
        : toErrorMessage(error);
    return { error: message };
  }
}
