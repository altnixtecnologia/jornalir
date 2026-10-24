"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import {checkModuleAction} from "../../../../lib/permissions/checkModuleAction";
import type { ArticleMedia } from "@ir/types";
import { getImportCandidateService, getNewspaperEditionService } from "../../../../composition/editorial";
import { extractCandidatesFromPdf } from "../../../../composition/pdfCandidateExtraction";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { getEditionPdfFromR2 } from "../../../../providers/r2/editionArchive.r2";

const IMPORT_PATH = "/sistema/editorial/importar-pdf";
const LIST_PATH = "/sistema/editorial/materias";

type ActionResult = { error: string } | { ok: true };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a ação.";
}

export interface GenerateCandidatesResult {
  ok: true;
  candidateCount: number;
  pageCount: number;
  pagesWithoutText: number[];
  warnings: string[];
}

export interface DuplicatePdfResult {
  duplicate: true;
  previousBatch: {
    fileName?: string;
    createdAt: string;
    candidateCount: number;
  };
}

/**
 * Lê o PDF selecionado e extrai candidatos reais via @ir/pdf-extraction.
 * O fluxo normal reutiliza o PDF oficial do R2. Este action permanece como
 * fallback para selecionar outro PDF só para extração; nunca arquiva novo
 * conteúdo no Drive/Supabase.
 *
 * Antes de gerar candidatos, calcula o hash (SHA-256) do arquivo e verifica
 * se esta MESMA edição já processou um PDF idêntico. Sem `--force` (campo
 * "force" no FormData), um PDF já processado nunca gera lote novo sozinho —
 * devolve um aviso (`DuplicatePdfResult`), nunca um erro, pra UI oferecer
 * "Reprocessar mesmo assim". Isto é importante porque o parser vai evoluir
 * (PaddleOCR/PP-StructureV3) e reprocessar uma edição já importada vai ser
 * uma operação legítima e esperada, não um erro do operador.
 */
export async function generateCandidates(
  editionId: string,
  formData: FormData,
): Promise<{ error: string } | DuplicatePdfResult | GenerateCandidatesResult> {
  const permissionError=await checkModuleAction("editorial","edicoes_gerenciar");
  if(permissionError)return {error:permissionError};
  if (!editionId) return { error: "Selecione uma edição." };

  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo PDF." };
  }
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return { error: "O arquivo selecionado não parece ser um PDF." };
  }
  const force = formData.get("force") === "1";

  try {
    const client = createSupabaseServerClient();
    const buffer = new Uint8Array(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    const candidateService = getImportCandidateService(client);
    if (!force) {
      const previousBatch = await candidateService.findBatchByHash(editionId, fileHash);
      if (previousBatch) {
        return {
          duplicate: true,
          previousBatch: {
            fileName: previousBatch.fileName,
            createdAt: previousBatch.createdAt,
            candidateCount: previousBatch.candidateCount,
          },
        };
      }
    }

    const result = await extractCandidatesFromPdf(editionId, buffer, candidateService, {
      fileName: file.name,
      fileHash,
      force,
    });
    if (result.candidates.length === 0) {
      return {
        error:
          result.pagesWithoutText.length > 0
            ? "Nenhum texto pôde ser identificado neste PDF (sem camada de texto e sem OCR disponível)."
            : "Nenhum conteúdo pôde ser identificado neste PDF.",
      };
    }

    const warnings = [...result.warnings];
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (edition && !edition.pdfUrl) {
      warnings.push(
        "Este PDF foi usado somente para extração. Para publicar no Jornal Online, envie o arquivo oficial em Editorial → Edições.",
      );
    }

    revalidatePath(IMPORT_PATH);
    revalidatePath("/sistema/editorial/edicoes");
    return {
      ok: true,
      candidateCount: result.candidates.length,
      pageCount: result.pageCount,
      pagesWithoutText: result.pagesWithoutText,
      warnings,
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function generateCandidatesFromArchivedPdf(
  editionId: string,
  force = false,
): Promise<{ error: string } | DuplicatePdfResult | GenerateCandidatesResult> {
  const permissionError=await checkModuleAction("editorial","edicoes_gerenciar");
  if(permissionError)return {error:permissionError};
  if (!editionId) return { error: "Selecione uma edição." };

  try {
    const client = createSupabaseServerClient();
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return { error: "Edição não encontrada." };
    if (edition.archiveProvider !== "r2" || !edition.pdfR2Key) {
      return { error: "Esta edição ainda não possui PDF oficial arquivado no R2." };
    }

    const buffer = await getEditionPdfFromR2(edition.pdfR2Key);
    const fileHash = edition.pdfSha256 || createHash("sha256").update(buffer).digest("hex");
    const fileName = edition.pdfFileName || `edicao-${edition.editionNumber}.pdf`;
    const candidateService = getImportCandidateService(client);

    if (!force) {
      const previousBatch = await candidateService.findBatchByHash(editionId, fileHash);
      if (previousBatch) {
        return {
          duplicate: true,
          previousBatch: {
            fileName: previousBatch.fileName,
            createdAt: previousBatch.createdAt,
            candidateCount: previousBatch.candidateCount,
          },
        };
      }
    }

    const result = await extractCandidatesFromPdf(editionId, buffer, candidateService, {
      fileName,
      fileHash,
      force,
    });
    if (result.candidates.length === 0) {
      return {
        error:
          result.pagesWithoutText.length > 0
            ? "Nenhum texto pôde ser identificado neste PDF (sem camada de texto e sem OCR disponível)."
            : "Nenhum conteúdo pôde ser identificado neste PDF.",
      };
    }

    revalidatePath(IMPORT_PATH);
    revalidatePath("/sistema/editorial/edicoes");
    return {
      ok: true,
      candidateCount: result.candidates.length,
      pageCount: result.pageCount,
      pagesWithoutText: result.pagesWithoutText,
      warnings: result.warnings,
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function discardCandidate(id: string): Promise<ActionResult> {
  const permissionError=await checkModuleAction("editorial","materias_editar");
  if(permissionError)return {error:permissionError};
  try {
    await getImportCandidateService(createSupabaseServerClient()).discard(id);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(IMPORT_PATH);
  return { ok: true };
}

/** Restaura um candidato descartado por engano de volta pra revisão
 * (`pending`) — nunca restaura um que foi absorvido por merge (ver
 * ImportCandidateService.restore). */
export async function restoreCandidate(id: string): Promise<ActionResult> {
  const permissionError=await checkModuleAction("editorial","materias_editar");
  if(permissionError)return {error:permissionError};
  try {
    await getImportCandidateService(createSupabaseServerClient()).restore(id);
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
  const permissionError=await checkModuleAction("editorial","materias_editar");
  if(permissionError)return {error:permissionError};
  try {
    await getImportCandidateService(createSupabaseServerClient()).merge(primaryId, secondaryIds);
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
  const permissionError=await checkModuleAction("editorial","materias_editar");
  if(permissionError)return {error:permissionError};
  try {
    const { first, second } = await getImportCandidateService(createSupabaseServerClient()).split(id);
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
  const permissionError=await checkModuleAction("editorial","materias_editar");
  if(permissionError)return {error:permissionError};
  try {
    await getImportCandidateService(createSupabaseServerClient()).keep(id, changes);
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
  const permissionError=await checkModuleAction("editorial","materias_criar");
  if(permissionError)return {error:permissionError};
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const article = await getImportCandidateService(client).convertToDraft(
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
