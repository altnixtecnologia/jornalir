"use server";

import { revalidatePath } from "next/cache";
import type { NewspaperEdition } from "@ir/types";
import { getNewspaperEditionService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { attachEditionR2Archive } from "../../../../providers/supabase/newspaperEditionRepository.supabase";
import {
  MAX_EDITION_PDF_BYTES,
  createEditionDirectUploadPlan,
  deleteEditionArchiveObject,
  getEditionArchivePublicUrl,
  isEditionArchiveKeyFor,
  isEditionR2ArchiveConfigured,
  validateEditionCoverObject,
  validateEditionPdfObject,
  type EditionDirectUploadPlan,
} from "../../../../providers/r2/editionArchive.r2";

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

type PrepareEditionUploadResult =
  | { error: string }
  | { ok: true; plan: EditionDirectUploadPlan };

export interface FinalizeEditionUploadInput {
  pdfKey: string;
  coverKey: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  pageCount: number;
}

async function requireStaffClient() {
  const client = createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Sessão expirada. Entre novamente no sistema.");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError || !profile?.active) throw new Error("Usuário sem permissão para enviar edições.");
  return client;
}

/**
 * Gera URLs PUT de curta duração. O PDF não passa pela Vercel:
 * navegador -> R2 diretamente.
 */
export async function prepareEditionR2UploadAction(
  editionId: string,
  fileName: string,
  fileSize: number,
): Promise<PrepareEditionUploadResult> {
  try {
    if (!fileName.toLowerCase().endsWith(".pdf")) return { error: "Selecione um arquivo PDF." };
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_EDITION_PDF_BYTES) {
      return { error: `O PDF precisa ter até ${MAX_EDITION_PDF_BYTES / 1024 / 1024} MB.` };
    }
    if (!isEditionR2ArchiveConfigured()) return { error: "Cloudflare R2 não está configurado neste ambiente." };

    const client = await requireStaffClient();
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return { error: "Edição não encontrada." };

    const plan = createEditionDirectUploadPlan(fileName, {
      editionNumber: edition.editionNumber,
      publicationDate: edition.publicationDate,
    });
    return { ok: true, plan };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function abandonEditionR2UploadAction(
  editionId: string,
  pdfKey: string,
  coverKey: string,
): Promise<void> {
  try {
    const client = await requireStaffClient();
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return;
    const options = { editionNumber: edition.editionNumber, publicationDate: edition.publicationDate };
    if (isEditionArchiveKeyFor(pdfKey, options)) {
      await deleteEditionArchiveObject(pdfKey).catch(() => undefined);
    }
    if (isEditionArchiveKeyFor(coverKey, options)) {
      await deleteEditionArchiveObject(coverKey).catch(() => undefined);
    }
  } catch {
    // Limpeza de tentativa incompleta é best-effort.
  }
}

export async function finalizeEditionR2UploadAction(
  editionId: string,
  input: FinalizeEditionUploadInput,
): Promise<ActionResult> {
  const client = await requireStaffClient();
  let attached = false;

  try {
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return { error: "Edição não encontrada." };

    const options = { editionNumber: edition.editionNumber, publicationDate: edition.publicationDate };
    if (!isEditionArchiveKeyFor(input.pdfKey, options) || !isEditionArchiveKeyFor(input.coverKey, options)) {
      return { error: "Os arquivos enviados não pertencem a esta edição." };
    }
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) return { error: "SHA-256 do PDF inválido." };
    if (!Number.isInteger(input.pageCount) || input.pageCount <= 0) return { error: "Quantidade de páginas inválida." };
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > MAX_EDITION_PDF_BYTES) {
      return { error: "Tamanho do PDF inválido." };
    }

    await Promise.all([
      validateEditionPdfObject(input.pdfKey, input.fileSize),
      validateEditionCoverObject(input.coverKey),
    ]);

    const { data: previous } = await client
      .from("newspaper_editions")
      .select("pdf_r2_key, cover_r2_key")
      .eq("id", editionId)
      .maybeSingle();

    await attachEditionR2Archive(client, editionId, {
      key: input.pdfKey,
      publicUrl: getEditionArchivePublicUrl(input.pdfKey),
      fileName: input.fileName.slice(0, 255),
      fileSize: input.fileSize,
      sha256: input.sha256.toLowerCase(),
      coverKey: input.coverKey,
      coverUrl: getEditionArchivePublicUrl(input.coverKey),
      pageCount: input.pageCount,
    });
    attached = true;

    const staleKeys = [previous?.pdf_r2_key, previous?.cover_r2_key]
      .filter((key): key is string => Boolean(key))
      .filter((key) => key !== input.pdfKey && key !== input.coverKey);
    await Promise.all(staleKeys.map((key) => deleteEditionArchiveObject(key).catch(() => undefined)));

    const updated = await getNewspaperEditionService(client).getById(editionId);
    if (!updated) return { error: "Edição não encontrada após finalizar o upload." };

    revalidatePath(LIST_PATH);
    revalidatePath("/sistema/editorial/importar-pdf");
    revalidatePath("/jornal-online");
    return { ok: true, edition: updated };
  } catch (error) {
    if (!attached) {
      await Promise.all([
        deleteEditionArchiveObject(input.pdfKey).catch(() => undefined),
        deleteEditionArchiveObject(input.coverKey).catch(() => undefined),
      ]);
    }
    return { error: toErrorMessage(error) };
  }
}
