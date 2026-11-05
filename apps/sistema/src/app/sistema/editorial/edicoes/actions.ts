"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import {checkModuleAction} from "../../../../lib/permissions/checkModuleAction";
import {isEditionDirectUploadPair} from "../../../../lib/editorial/editionDirectUploadKeys";
import {isDuplicateEditionUpload} from "../../../../lib/editorial/editionUploadDedup";
import type { NewspaperEdition } from "@ir/types";
import { getNewspaperEditionService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { attachEditionR2Archive } from "../../../../providers/supabase/newspaperEditionRepository.supabase";
import { decideEditionArchiveAction, type EditionArchiveDecision } from "../../../../providers/r2/editionArchiveRecognition";
import { renderEditionCoverWebp } from "../../../../providers/r2/editionCoverRenderer";
import {
  MAX_EDITION_PDF_BYTES,
  createEditionDirectUploadPlan,
  deleteEditionArchiveObject,
  findAcervoEditionArchiveObject,
  getEditionArchivePublicUrl,
  getEditionPdfFromR2,
  ensureEditionR2CorsConfigured,
  isEditionR2ReadConfigured,
  sha256OfEditionArchiveObject,
  uploadEditionCoverBufferToR2,
  validateEditionCoverObject,
  validateEditionPdfObject,
  type EditionDirectUploadPlan,
} from "../../../../providers/r2/editionArchive.r2";
import { generateCandidatesFromArchivedPdf, type CandidateDuplicateWarning } from "../importar-pdf/actions";

const LIST_PATH = "/sistema/editorial/edicoes";

export type EditionExtractionOutcome =
  | { status: "ok"; candidateCount: number; pageCount: number; possibleDuplicates: CandidateDuplicateWarning[] }
  | { status: "skipped_duplicate"; previousBatchCandidateCount: number }
  | { status: "failed"; error: string };

type ActionResult =
  | { error: string }
  | { ok: true; edition: NewspaperEdition; extraction?: EditionExtractionOutcome };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar a edição.";
}

/**
 * Dispara a extração de matérias imediatamente depois que um PDF é
 * arquivado/reaproveitado pelo operador (upload novo ou acervo R2) — sem
 * exigir outro comando manual. NUNCA desfaz o arquivamento já confirmado:
 * qualquer falha aqui (parser, PDF corrompido, timeout) é capturada e
 * devolvida como resultado informativo, nunca propagada como erro da
 * ação de arquivamento. Tentar de novo (reenviar o mesmo PDF ou chamar o
 * botão manual "Gerar candidatos" na tela de importação) nunca duplica
 * lote — `findBatchByHash`/`force` já cobrem isso.
 *
 * Deliberadamente só chamada a partir de `finalizeEditionR2UploadAction` e
 * `attachArchivedEditionPdfAction` (ações de UM operador sobre UMA
 * edição) — nunca do importador histórico em lote das 497 edições, que
 * continua scripts isolados sem nenhuma extração automática.
 */
async function runAutomaticExtraction(editionId: string): Promise<EditionExtractionOutcome> {
  try {
    const result = await generateCandidatesFromArchivedPdf(editionId, false);
    if ("error" in result) return { status: "failed", error: result.error };
    if ("duplicate" in result) {
      return { status: "skipped_duplicate", previousBatchCandidateCount: result.previousBatch.candidateCount };
    }
    return {
      status: "ok",
      candidateCount: result.candidateCount,
      pageCount: result.pageCount,
      possibleDuplicates: result.possibleDuplicates,
    };
  } catch (error) {
    return { status: "failed", error: toErrorMessage(error) };
  }
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
  const permissionError = await checkModuleAction("editorial","edicoes_gerenciar");
  if(permissionError)return {error:permissionError};
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
  const permissionError = await checkModuleAction("editorial","edicoes_gerenciar");
  if(permissionError)return {error:permissionError};
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
  const permissionError = await checkModuleAction("editorial","edicoes_gerenciar");
  if(permissionError)return {error:permissionError};
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
  | { conflict: true; currentFileName?: string }
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
  const permissionError=await checkModuleAction("editorial","edicoes_gerenciar");
  if(permissionError)throw new Error(permissionError);
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
  sha256: string,
  confirmReplace = false,
): Promise<PrepareEditionUploadResult> {
  try {
    if (!fileName.toLowerCase().endsWith(".pdf")) return { error: "Selecione um arquivo PDF." };
    if(!/^[a-f0-9]{64}$/i.test(sha256))return {error:"Hash do PDF inválido."};
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_EDITION_PDF_BYTES) {
      return { error: `O PDF precisa ter até ${MAX_EDITION_PDF_BYTES / 1024 / 1024} MB.` };
    }
    if (!isEditionR2ReadConfigured()) return { error: "Cloudflare R2 não está configurado neste ambiente." };

    const client = await requireStaffClient();
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return { error: "Edição não encontrada." };
    if(isDuplicateEditionUpload(edition,sha256))
      return {error:"Este PDF já está arquivado nesta edição com capa. Não é necessário reenviar."};

    // Edição já tem outro PDF arquivado e o arquivo selecionado é diferente
    // (hash não confere): nunca substitui silenciosamente — exige decisão
    // explícita do operador antes de preparar um novo upload.
    const decision = decideEditionArchiveAction({
      currentPdfR2Key: edition.pdfR2Key ?? null,
      currentPdfSha256: edition.pdfSha256 ?? null,
      candidateKey: null,
      candidateSha256: sha256,
    });
    if (decision === "conflict_requires_decision" && !confirmReplace) {
      return { conflict: true, currentFileName: edition.pdfFileName };
    }

    await ensureEditionR2CorsConfigured();

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
    // NUNCA excluir chaves publicadas nem nomes genéricos sob o prefixo.
    if(!isEditionDirectUploadPair(pdfKey,coverKey,edition.editionNumber,edition.publicationDate))return;
    const {data:attached,error:lookupError}=await client
      .from("newspaper_editions")
      .select("pdf_r2_key, cover_r2_key")
      .eq("id",editionId).maybeSingle();
    if(lookupError||!attached||attached.pdf_r2_key===pdfKey||attached.cover_r2_key===coverKey)return;
    await Promise.all([
      deleteEditionArchiveObject(pdfKey).catch(()=>undefined),
      deleteEditionArchiveObject(coverKey).catch(()=>undefined),
    ]);
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
    // Verificação adicional após os PUTs, sem regravar objeto idêntico.
    if(isDuplicateEditionUpload(edition,input.sha256))
      return {error:"Este PDF já consta nesta edição. Reabra o cadastro para conferir."};

    const options = { editionNumber: edition.editionNumber, publicationDate: edition.publicationDate };
    if (!isEditionDirectUploadPair(input.pdfKey,input.coverKey,edition.editionNumber,edition.publicationDate)) {
      return { error: "O PDF e a capa devem pertencer à mesma tentativa de upload desta edição." };
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

    // Arquivamento já confirmado acima — a extração automática daqui pra
    // frente nunca pode desfazê-lo, mesmo se falhar (ver runAutomaticExtraction).
    const extraction = await runAutomaticExtraction(editionId);

    revalidatePath(LIST_PATH);
    revalidatePath("/sistema/editorial/importar-pdf");
    revalidatePath("/jornal-online");
    return { ok: true, edition: updated, extraction };
  } catch (error) {
    if (!attached) {
      // Em falha ambígua, o banco pode já ter confirmado o vínculo.
      // Na dúvida, manter o objeto é mais seguro que apagar um PDF oficial.
      try {
        const {data:current,error:lookupError}=await client.from("newspaper_editions")
          .select("edition_number,publication_date,pdf_r2_key,cover_r2_key")
          .eq("id",editionId).maybeSingle();
        if(!lookupError&&current&&
          isEditionDirectUploadPair(input.pdfKey,input.coverKey,current.edition_number,current.publication_date)&&
          current.pdf_r2_key!==input.pdfKey&&current.cover_r2_key!==input.coverKey){
          await Promise.all([
            deleteEditionArchiveObject(input.pdfKey).catch(()=>undefined),
            deleteEditionArchiveObject(input.coverKey).catch(()=>undefined),
          ]);
        }
      }catch{/* falha ao conferir vínculo: não excluir arquivos */ }
    }
    return { error: toErrorMessage(error) };
  }
}

export interface RecognizeEditionArchiveResult {
  decision: EditionArchiveDecision;
  candidateKey: string | null;
  candidateSizeBytes: number | null;
}

/**
 * Verifica se o PDF desta edição já existe no acervo histórico do R2
 * (`acervo/edicoes/IR NNN.pdf`) SEM fazer upload nenhum — só leitura
 * (listagem + tamanho já retornado por ela). O operador decide, a partir
 * do resultado, se confirma o reaproveitamento (`attachArchivedEditionPdfAction`).
 */
export async function recognizeEditionArchivedPdfAction(
  editionId: string,
): Promise<{ error: string } | { ok: true; result: RecognizeEditionArchiveResult }> {
  const permissionError = await checkModuleAction("editorial", "edicoes_gerenciar");
  if (permissionError) return { error: permissionError };
  try {
    if (!isEditionR2ReadConfigured()) return { error: "Cloudflare R2 não está configurado neste ambiente." };
    const client = await requireStaffClient();
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return { error: "Edição não encontrada." };

    const candidate = await findAcervoEditionArchiveObject(edition.editionNumber);
    if (!candidate) {
      return {
        ok: true,
        result: { decision: "no_current_archive", candidateKey: null, candidateSizeBytes: null },
      };
    }

    let decision = decideEditionArchiveAction({
      currentPdfR2Key: edition.pdfR2Key ?? null,
      currentPdfSha256: edition.pdfSha256 ?? null,
      candidateKey: candidate.key,
      candidateSha256: null,
    });
    // Só baixa e calcula o hash quando já existe algo vinculado a outra
    // chave — é o único caso em que a identidade de conteúdo decide algo
    // (reaproveitar sem novo upload vs. exigir decisão explícita).
    if (decision === "conflict_requires_decision" && edition.pdfSha256) {
      const candidateSha256 = await sha256OfEditionArchiveObject(candidate.key);
      decision = decideEditionArchiveAction({
        currentPdfR2Key: edition.pdfR2Key ?? null,
        currentPdfSha256: edition.pdfSha256 ?? null,
        candidateKey: candidate.key,
        candidateSha256,
      });
    }

    return { ok: true, result: { decision, candidateKey: candidate.key, candidateSizeBytes: candidate.size } };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * Confirma o reaproveitamento de um PDF já existente no acervo R2: baixa o
 * objeto (somente leitura), confere o SHA-256, renderiza a capa da página 1
 * e grava a capa + vincula a edição (`attachEditionR2Archive`) — a ÚNICA
 * ação desta tela que grava no R2 (a capa) e no Supabase. Nunca sobrescreve
 * um PDF diferente já vinculado sem `confirmReplace: true` explícito.
 */
export async function attachArchivedEditionPdfAction(
  editionId: string,
  candidateKey: string,
  confirmReplace = false,
): Promise<ActionResult> {
  const permissionError = await checkModuleAction("editorial", "edicoes_gerenciar");
  if (permissionError) return { error: permissionError };
  try {
    if (!isEditionR2ReadConfigured()) return { error: "Cloudflare R2 não está configurado neste ambiente." };
    const client = await requireStaffClient();
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return { error: "Edição não encontrada." };

    const pdfBytes = await getEditionPdfFromR2(candidateKey);
    if (pdfBytes.length > MAX_EDITION_PDF_BYTES) {
      return { error: `O PDF do acervo excede o limite atual de ${MAX_EDITION_PDF_BYTES / 1024 / 1024} MB.` };
    }
    const sha256 = createHash("sha256").update(pdfBytes).digest("hex");

    const decision = decideEditionArchiveAction({
      currentPdfR2Key: edition.pdfR2Key ?? null,
      currentPdfSha256: edition.pdfSha256 ?? null,
      candidateKey,
      candidateSha256: sha256,
    });
    if (decision === "same_object_already_linked") return { ok: true, edition };
    if (decision === "conflict_requires_decision" && !confirmReplace) {
      return { error: "Esta edição já possui um PDF diferente arquivado. Confirme explicitamente a substituição." };
    }

    const cover = await renderEditionCoverWebp(pdfBytes);
    const coverUpload = await uploadEditionCoverBufferToR2(cover.webpBuffer, {
      editionNumber: edition.editionNumber,
      publicationDate: edition.publicationDate,
    });

    const previousCoverKey = edition.archiveProvider === "r2" ? edition.pdfR2Key : null;
    await attachEditionR2Archive(client, editionId, {
      key: candidateKey,
      publicUrl: getEditionArchivePublicUrl(candidateKey),
      fileName: candidateKey.split("/").pop() ?? `edicao-${edition.editionNumber}.pdf`,
      fileSize: pdfBytes.length,
      sha256,
      coverKey: coverUpload.key,
      coverUrl: coverUpload.publicUrl,
    });

    // Capa antiga (se houve substituição real) deixa de ser referenciada;
    // o PDF do acervo histórico nunca é apagado por esta ação (é o arquivo
    // oficial de origem, preservado sempre).
    if (previousCoverKey && previousCoverKey !== candidateKey) {
      await deleteEditionArchiveObject(previousCoverKey).catch(() => undefined);
    }

    const updated = await getNewspaperEditionService(client).getById(editionId);
    if (!updated) return { error: "Edição não encontrada após vincular o PDF do acervo." };

    // Vínculo já confirmado acima — falha na extração automática a seguir
    // nunca desfaz o que já foi gravado (ver runAutomaticExtraction).
    const extraction = await runAutomaticExtraction(editionId);

    revalidatePath(LIST_PATH);
    revalidatePath("/sistema/editorial/importar-pdf");
    revalidatePath("/jornal-online");
    return { ok: true, edition: updated, extraction };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
