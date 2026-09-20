"use server";

import { revalidatePath } from "next/cache";
import type { ArticleMedia } from "@ir/types";
import {
  generateCandidatesForEdition,
  importCandidateService,
} from "../../../../composition/editorial";
import { SIMULATED_AUDIT as AUDIT } from "../../../../lib/simulatedAudit";

const IMPORT_PATH = "/sistema/editorial/importar-pdf";
const LIST_PATH = "/sistema/editorial/materias";

type ActionResult = { error: string } | { ok: true };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a ação.";
}

export async function generateCandidates(editionId: string): Promise<ActionResult> {
  if (!editionId) return { error: "Selecione uma edição." };
  try {
    await generateCandidatesForEdition(editionId);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(IMPORT_PATH);
  return { ok: true };
}

export async function discardCandidate(id: string): Promise<ActionResult> {
  try {
    await importCandidateService.discard(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(IMPORT_PATH);
  return { ok: true };
}

export async function mergeCandidates(
  primaryId: string,
  secondaryIds: string[],
): Promise<ActionResult> {
  if (secondaryIds.length === 0) {
    return { error: "Selecione ao menos dois candidatos para mesclar." };
  }
  try {
    await importCandidateService.merge(primaryId, secondaryIds);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(IMPORT_PATH);
  return { ok: true };
}

export interface SplitResult {
  ok: true;
  firstId: string;
  secondId: string;
}

export async function splitCandidate(id: string): Promise<{ error: string } | SplitResult> {
  try {
    const { first, second } = await importCandidateService.split(id);
    revalidatePath(IMPORT_PATH);
    return { ok: true, firstId: first.id, secondId: second.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export interface ReviewFormInput {
  title?: string;
  subtitle?: string;
  body?: string;
  sectionId?: string;
  localityId?: string;
  pageNumber?: number;
  mediaAssetIds?: string[];
}

export async function keepCandidate(id: string, changes: ReviewFormInput): Promise<ActionResult> {
  try {
    await importCandidateService.keep(id, changes);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(IMPORT_PATH);
  revalidatePath(`${IMPORT_PATH}/${id}`);
  return { ok: true };
}

export interface ConvertCandidateInput extends ReviewFormInput {
  media?: ArticleMedia[];
}

export interface ConvertResult {
  ok: true;
  articleId: string;
}

export async function convertCandidate(
  id: string,
  input: ConvertCandidateInput,
): Promise<{ error: string } | ConvertResult> {
  try {
    const article = await importCandidateService.convertToDraft(
      id,
      { ...input, createdBy: AUDIT.actorId },
      AUDIT,
    );
    revalidatePath(IMPORT_PATH);
    revalidatePath(LIST_PATH);
    return { ok: true, articleId: article.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
