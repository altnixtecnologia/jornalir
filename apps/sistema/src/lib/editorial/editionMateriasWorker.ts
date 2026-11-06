import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getImportCandidateService, getNewspaperEditionService } from "../../composition/editorial";
import { extractCandidatesFromPdf } from "../../composition/pdfCandidateExtraction";
import { getEditionPdfFromR2 } from "../../providers/r2/editionArchive.r2";
import { updateEditionMateriasStatus } from "../../providers/supabase/newspaperEditionRepository.supabase";

/**
 * Worker durável da separação automática de matérias (correção da
 * auditoria, item 3, 06/11/2026). Chamado tanto pela Server Action de
 * upload (uma primeira tentativa rápida, sem bloquear a resposta ao
 * operador — ver `edicoes/actions.ts`) quanto pelo cron
 * `/api/cron/edition-materias` (retomada automática a cada minuto, via
 * `claim_newspaper_editions_for_materias_work`, que também recupera
 * trabalho preso em `processing` além do lease).
 *
 * NUNCA reextrai um PDF que já tem lote (`pdf_import_batches`) — preserva
 * os candidatos já `converted` (correção da auditoria, item 2): o
 * "reprocessamento" é sempre retomar candidatos pendentes do MESMO lote,
 * nunca gerar um lote novo. Processa em unidades de trabalho limitadas
 * (`CHUNK_SIZE` candidatos por chamada), nunca a edição inteira de uma
 * só vez — evita uma requisição longa o suficiente para esbarrar no
 * timeout de uma função serverless.
 */
const CHUNK_SIZE = 10;
/** Tentativas automáticas (worker/cron) antes de marcar um candidato como
 * permanentemente travado (edição vai para 'partial', nunca fica
 * tentando para sempre a cada minuto). Reprocessamento MANUAL (botão na
 * UI) ignora este limite — é uma decisão explícita de um humano, sempre
 * tenta de novo. */
const MAX_AUTOMATIC_ATTEMPTS = 3;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Falha ao converter candidato em rascunho.";
}

async function fetchAutomaticFailureCounts(
  client: SupabaseClient,
  editionId: string,
): Promise<Map<string, number>> {
  const { data, error } = await client
    .from("audit_events")
    .select("metadata")
    .eq("entity_type", "newspaper_editions")
    .eq("entity_id", editionId)
    .eq("action", "edition_materias_candidate_failed");
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const metadata = row.metadata as Record<string, unknown> | null;
    const candidateId = typeof metadata?.candidateId === "string" ? metadata.candidateId : null;
    if (!candidateId) continue;
    counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Converte cada candidato individualmente — uma falha NUNCA interrompe os
 * demais do lote. Sempre `createdBy`/auditoria nulos aqui: esta função
 * roda tanto a partir de uma Server Action (há um usuário real, mas a
 * conversão em si é automática, sem revisão manual, por decisão do
 * usuário em 06/11/2026) quanto a partir do cron (nenhum usuário real) —
 * o rascunho em si não tem "autor" humano; quem fez upload do PDF já é
 * auditado em `newspaper_editions.uploaded_by`.
 */
async function convertCandidates(
  client: SupabaseClient,
  editionId: string,
  candidateIds: string[],
): Promise<{ draftCount: number; failedCount: number }> {
  const candidateService = getImportCandidateService(client);
  let draftCount = 0;
  let failedCount = 0;
  for (const candidateId of candidateIds) {
    try {
      // `createdBy`/`_audit` não são lidos por `convertToDraft` (campo
      // exigido pelo tipo, mas sem uso real na RPC) — "system" é só um
      // valor de tipo, nunca um autor humano fictício em auditoria real
      // (quem fez upload do PDF já é auditado em uploaded_by).
      await candidateService.convertToDraft(candidateId, { createdBy: "system" }, { actorId: "system", actorRole: "editorial" });
      draftCount += 1;
    } catch (error) {
      failedCount += 1;
      await client.from("audit_events").insert({
        user_id: null,
        entity_type: "newspaper_editions",
        entity_id: editionId,
        action: "edition_materias_candidate_failed",
        metadata: { candidateId, error: toErrorMessage(error), origin: "edition_materias_worker" },
      });
    }
  }
  return { draftCount, failedCount };
}

// Usa o cliente recebido (service-role no cron, sessão do operador no
// reprocessamento manual) — nunca a Server Action de importar-pdf, que exige
// sessão de usuário e falharia sempre quando chamada pelo cron.
async function extractCandidatesForEdition(client: SupabaseClient, editionId: string): Promise<string | null> {
  try {
    const edition = await getNewspaperEditionService(client).getById(editionId);
    if (!edition) return "Edição não encontrada.";
    if (edition.archiveProvider !== "r2" || !edition.pdfR2Key) {
      return "Esta edição ainda não possui PDF oficial arquivado no R2.";
    }
    const buffer = await getEditionPdfFromR2(edition.pdfR2Key);
    const fileHash = edition.pdfSha256 || createHash("sha256").update(buffer).digest("hex");
    const fileName = edition.pdfFileName || `edicao-${edition.editionNumber}.pdf`;
    const result = await extractCandidatesFromPdf(editionId, buffer, getImportCandidateService(client), {
      fileName,
      fileHash,
      force: false,
    });
    if (result.candidates.length === 0) {
      return result.pagesWithoutText.length > 0
        ? "Nenhum texto pôde ser identificado neste PDF (sem camada de texto e sem OCR disponível)."
        : "Nenhum conteúdo pôde ser identificado neste PDF.";
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Falha ao extrair matérias do PDF.";
  }
}

export interface EditionMateriasWorkOutcome {
  status: "queued" | "processing" | "completed" | "partial" | "failed";
  candidateCount: number;
  draftCount: number;
  pendingRemaining: number;
}

export interface RunEditionMateriasWorkOptions {
  /** true = chamada automática (upload/cron): respeita MAX_AUTOMATIC_ATTEMPTS,
   * nunca tenta para sempre um candidato permanentemente quebrado. false =
   * reprocessamento manual (botão na UI): sempre tenta de novo, decisão
   * explícita de um humano. Padrão: true. */
  respectAutomaticRetryLimit?: boolean;
}

/**
 * Executa UMA unidade de trabalho para a edição: garante que existe um
 * lote (extrai só se nenhum existir ainda — nunca reextrai), converte até
 * `CHUNK_SIZE` candidatos pendentes elegíveis, persiste o estado real em
 * `newspaper_editions` e devolve o resultado. Idempotente/retomável: pode
 * ser chamada repetidamente (cron a cada minuto) até não haver mais
 * trabalho pendente.
 */
export async function runEditionMateriasWorkUnit(
  client: SupabaseClient,
  editionId: string,
  options: RunEditionMateriasWorkOptions = {},
): Promise<EditionMateriasWorkOutcome> {
  const respectLimit = options.respectAutomaticRetryLimit ?? true;

  const { data: existingBatch, error: batchError } = await client
    .from("pdf_import_batches")
    .select("id")
    .eq("newspaper_edition_id", editionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (batchError) throw new Error(batchError.message);

  if (!existingBatch) {
    const extractionError = await extractCandidatesForEdition(client, editionId);
    if (extractionError) {
      await client.from("audit_events").insert({
        user_id: null,
        entity_type: "newspaper_editions",
        entity_id: editionId,
        action: "edition_materias_extraction_failed",
        metadata: { error: extractionError, origin: "edition_materias_worker" },
      });
      await updateEditionMateriasStatus(client, editionId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
      });
      return { status: "failed", candidateCount: 0, draftCount: 0, pendingRemaining: 0 };
    }
  }

  const { data: pendingRows, error: pendingError } = await client
    .from("pdf_import_candidates")
    .select("id")
    .eq("newspaper_edition_id", editionId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (pendingError) throw new Error(pendingError.message);
  const allPendingIds = (pendingRows ?? []).map((row) => row.id as string);

  const attemptCounts = respectLimit ? await fetchAutomaticFailureCounts(client, editionId) : new Map<string, number>();
  const stuckIds = new Set(
    respectLimit ? allPendingIds.filter((id) => (attemptCounts.get(id) ?? 0) >= MAX_AUTOMATIC_ATTEMPTS) : [],
  );
  const retryableIds = allPendingIds.filter((id) => !stuckIds.has(id));
  const chunk = retryableIds.slice(0, CHUNK_SIZE);

  if (chunk.length > 0) {
    await convertCandidates(client, editionId, chunk);
  }

  const { data: totalsRows, error: totalsError } = await client
    .from("pdf_import_candidates")
    .select("id, status")
    .eq("newspaper_edition_id", editionId);
  if (totalsError) throw new Error(totalsError.message);
  const totals = (totalsRows ?? []) as Array<{ id: string; status: string }>;
  const candidateCount = totals.filter((row) => !["discarded", "merged", "split"].includes(row.status)).length;
  const draftCount = totals.filter((row) => row.status === "converted").length;
  const stillPendingIds = totals.filter((row) => row.status === "pending").map((row) => row.id);
  const stillRetryableCount = stillPendingIds.filter((id) => !stuckIds.has(id)).length;
  const stillStuckCount = stillPendingIds.length - stillRetryableCount;

  if (stillRetryableCount > 0) {
    // Sempre volta para 'queued' (nunca fica em 'processing' esperando o
    // lease de retomada expirar) — a próxima execução do worker, em até
    // 1 minuto, continua de onde parou, sem reextrair nada.
    await updateEditionMateriasStatus(client, editionId, {
      status: "queued",
      candidateCount,
      draftCount,
      failedCount: stillPendingIds.length,
    });
    return { status: "queued", candidateCount, draftCount, pendingRemaining: stillRetryableCount };
  }

  const finalStatus: EditionMateriasWorkOutcome["status"] =
    stillStuckCount > 0 ? (draftCount > 0 ? "partial" : "failed") : draftCount > 0 ? "completed" : "failed";

  await updateEditionMateriasStatus(client, editionId, {
    status: finalStatus,
    candidateCount,
    draftCount,
    failedCount: stillStuckCount,
    finishedAt: new Date().toISOString(),
  });
  return { status: finalStatus, candidateCount, draftCount, pendingRemaining: 0 };
}
