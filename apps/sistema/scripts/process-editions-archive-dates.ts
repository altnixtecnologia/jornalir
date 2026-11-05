/**
 * Processamento (não produção) da data real de publicação de TODAS as
 * edições já existentes no bucket R2 exclusivo do acervo histórico
 * (`acervo/edicoes/IR NNN.pdf`), reaproveitando o mesmo reconhecimento
 * validado na amostra de 12 edições (12/12 "alta" confiança, ver
 * scripts/investigate-edition-dates-sample.ts e
 * src/providers/r2/editionDateRecognition.ts — nenhuma lógica nova de
 * reconhecimento de data foi criada aqui).
 *
 * SOMENTE LEITURA: lista e baixa bytes do R2 (ListObjectsV2/GetObject já
 * existentes), nunca grava nada no R2 nem no Supabase, nunca publica o
 * bucket, nunca gera capas. Não estima data por periodicidade semanal —
 * toda data vem só do texto do próprio PDF; sem evidência, fica pendente.
 *
 * Concorrência baixa e controlada (padrão 3, configurável via --concurrency)
 * para não saturar memória com vários PDFs grandes (~7-10MB cada, texto
 * extraído e descartado por item) ao mesmo tempo.
 *
 * Checkpoint/retomada: a cada edição processada, o resultado é gravado
 * incrementalmente em um arquivo JSON de checkpoint. Se o processo for
 * interrompido, rodar de novo (mesmo --out) retoma a partir do checkpoint,
 * sem reprocessar o que já tem resultado. Use --force para reprocessar tudo.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/process-editions-archive-dates.ts \
 *     [--concurrency=3] [--out=caminho/relatorio.csv] [--force]
 *   (precisa de NODE_OPTIONS="--conditions=react-server" por causa de
 *   "server-only" em editionArchive.r2.ts — ver nota no dry-run script)
 */
import {
  getEditionPdfFromR2,
  isEditionR2ReadConfigured,
  listEditionArchiveObjects,
} from "../src/providers/r2/editionArchive.r2";
import { parseEditionArchiveObjectKey } from "../src/providers/r2/editionsArchiveImportPlan";
import {
  findDateCandidates,
  pickBestCandidate,
  weekdayMatches,
  extractEditionLabels,
  type Confidence,
  type DateCandidate,
} from "../src/providers/r2/editionDateRecognition";
import { loadPdfDocument, extractPageTextItems, hasTextLayer } from "@ir/pdf-extraction";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Status =
  | "confirmada" // data de alta confiança + dia da semana bate + número da edição no texto bate com a chave R2
  | "confirmada_sem_cruzamento_completo" // alta confiança, mas dia da semana ou número da edição não puderam ser cruzados (não necessariamente errado)
  | "inconsistente" // há evidência, mas algo não bate (dia da semana ou número da edição divergem do esperado)
  | "ambigua" // confiança média — evidência existe mas não é unívoca
  | "sem_data" // nenhuma data reconhecida (com ou sem camada de texto)
  | "erro"; // falha ao baixar/abrir o PDF

interface EditionDateResult {
  editionNumber: number;
  key: string;
  sizeBytes: number;
  hasTextLayer: boolean;
  confidence: Confidence;
  status: Status;
  dateIso: string | null;
  weekdayExtracted: string | null;
  weekdayMatchesCalendar: boolean | null;
  editionNumberInText: number | null;
  editionNumberMatchesKey: boolean | null;
  evidenceSnippet: string;
  totalCandidates: number;
  note: string;
}

const DEFAULT_CONCURRENCY = 3;

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function investigateOne(editionNumber: number, key: string, sizeBytes: number): Promise<EditionDateResult> {
  try {
    const bytes = await getEditionPdfFromR2(key);
    const doc = await loadPdfDocument(bytes);

    const pageCount = Math.min(doc.numPages, 2);
    let fullText = "";
    let hasAnyTextLayer = false;
    const allCandidates: DateCandidate[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const items = await extractPageTextItems(page);
      const pageHasText = hasTextLayer(items);
      if (pageHasText) hasAnyTextLayer = true;
      const pageText = items.map((item) => item.text).join(" ");
      fullText += `\n${pageText}`;
      allCandidates.push(...findDateCandidates(pageText, pageNumber));
    }

    const { best, confidence } = pickBestCandidate(allCandidates, fullText);

    const weekdayMatch = best?.normalized ? weekdayMatches(best.normalized, best.weekdayExtracted) : null;
    const editionLabels = extractEditionLabels(fullText);
    const editionNumberInText = editionLabels.length > 0 ? editionLabels[0] : null;
    const editionNumberMatchesKey = editionNumberInText !== null ? editionNumberInText === editionNumber : null;

    let status: Status;
    let note: string;

    if (!hasAnyTextLayer) {
      status = "sem_data";
      note = "PDF sem camada de texto pesquisável nas 2 primeiras páginas (provável digitalização/imagem) — precisaria de OCR, não executado nesta etapa.";
    } else if (!best || !best.normalized) {
      status = "sem_data";
      note = "Nenhum padrão de data reconhecido nas 2 primeiras páginas.";
    } else if (confidence === "alta") {
      if (weekdayMatch === false || editionNumberMatchesKey === false) {
        status = "inconsistente";
        const problems: string[] = [];
        if (weekdayMatch === false) problems.push("dia da semana extraído não corresponde ao calendário real para a data encontrada");
        if (editionNumberMatchesKey === false) problems.push(`número de edição no texto (${editionNumberInText}) diverge do número da chave R2 (${editionNumber})`);
        note = `Data de alta confiança encontrada, mas inconsistência detectada: ${problems.join("; ")}.`;
      } else if (weekdayMatch === true && editionNumberMatchesKey === true) {
        status = "confirmada";
        note = "Data de alta confiança, dia da semana confere com o calendário real e número da edição no texto confere com a chave R2.";
      } else {
        status = "confirmada_sem_cruzamento_completo";
        note = "Data de alta confiança, mas não foi possível cruzar totalmente dia da semana e/ou número da edição no texto (não necessariamente errado).";
      }
    } else if (confidence === "media") {
      status = "ambigua";
      note = "Evidência encontrada, mas ambígua (datas divergentes, ou numérica sem contexto de masthead claro) — requer confirmação humana.";
    } else {
      status = "sem_data";
      note = "Evidência insuficiente ou só parcial (ex.: dia da semana sem mês/ano) — marcado como pendente.";
    }

    return {
      editionNumber,
      key,
      sizeBytes,
      hasTextLayer: hasAnyTextLayer,
      confidence,
      status,
      dateIso: best?.normalized ?? null,
      weekdayExtracted: best?.weekdayExtracted ?? null,
      weekdayMatchesCalendar: weekdayMatch,
      editionNumberInText,
      editionNumberMatchesKey,
      evidenceSnippet: best?.snippet ?? "",
      totalCandidates: allCandidates.length,
      note,
    };
  } catch (error) {
    return {
      editionNumber,
      key,
      sizeBytes,
      hasTextLayer: false,
      confidence: "baixa_ou_pendente",
      status: "erro",
      dateIso: null,
      weekdayExtracted: null,
      weekdayMatchesCalendar: null,
      editionNumberInText: null,
      editionNumberMatchesKey: null,
      evidenceSnippet: "",
      totalCandidates: 0,
      note: `Erro ao baixar/abrir/processar o PDF: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function toCsv(results: EditionDateResult[]): string {
  const header = [
    "edition_number",
    "r2_key",
    "size_bytes",
    "has_text_layer",
    "confidence",
    "status",
    "date_iso",
    "weekday_extracted",
    "weekday_matches_calendar",
    "edition_number_in_text",
    "edition_number_matches_key",
    "evidence_snippet",
    "total_candidates",
    "note",
  ].join(",");

  const esc = (value: string | number | boolean | null) => {
    if (value === null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = results
    .sort((a, b) => a.editionNumber - b.editionNumber)
    .map((r) =>
      [
        r.editionNumber,
        r.key,
        r.sizeBytes,
        r.hasTextLayer ? "sim" : "nao",
        r.confidence,
        r.status,
        r.dateIso,
        r.weekdayExtracted,
        r.weekdayMatchesCalendar,
        r.editionNumberInText,
        r.editionNumberMatchesKey,
        r.evidenceSnippet,
        r.totalCandidates,
        r.note,
      ].map(esc).join(","),
    );

  return [header, ...lines].join("\n");
}

/** Semáforo simples para limitar concorrência sem dependência nova. */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onResult: (result: R, item: T, index: number) => void,
): Promise<void> {
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) return;
    const item = items[index];
    const result = await worker(item, index);
    onResult(result, item, index);
    await runNext();
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
}

function loadCheckpoint(path: string): Map<number, EditionDateResult> {
  const map = new Map<number, EditionDateResult>();
  if (!existsSync(path)) return map;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as EditionDateResult[];
    for (const r of raw) map.set(r.editionNumber, r);
  } catch {
    console.warn(`[lote] Checkpoint em ${path} ilegível — ignorando e recomeçando do zero.`);
  }
  return map;
}

function saveCheckpoint(path: string, resultsByEdition: Map<number, EditionDateResult>): void {
  const all = Array.from(resultsByEdition.values()).sort((a, b) => a.editionNumber - b.editionNumber);
  writeFileSync(path, JSON.stringify(all, null, 2), "utf8");
}

async function main() {
  if (!isEditionR2ReadConfigured()) {
    console.error("R2 de edições não está configurado para leitura. Nenhum valor exibido por segurança.");
    process.exitCode = 1;
    return;
  }

  const outPath = parseArg("out", "editions-archive-dates-report.csv");
  const checkpointPath = `${outPath}.checkpoint.json`;
  const concurrency = Math.max(1, Number(parseArg("concurrency", String(DEFAULT_CONCURRENCY))) || DEFAULT_CONCURRENCY);
  const force = hasFlag("force");

  console.log("[lote] Listando objetos do bucket de edições (acervo/edicoes/)...");
  const objects = await listEditionArchiveObjects("acervo/edicoes/");
  const parsed = objects
    .map((obj) => ({ obj, editionNumber: parseEditionArchiveObjectKey(obj.key) }))
    .filter((entry): entry is { obj: typeof objects[number]; editionNumber: number } => entry.editionNumber !== null);

  console.log(`[lote] ${objects.length} objetos listados; ${parsed.length} reconhecidos como edição (padrão "acervo/edicoes/IR NNN.pdf").`);
  if (parsed.length !== objects.length) {
    console.warn(`[lote] ${objects.length - parsed.length} objeto(s) não reconhecido(s) pelo padrão — ignorados nesta etapa, sem alterar nada no R2.`);
  }

  const resultsByEdition = force ? new Map<number, EditionDateResult>() : loadCheckpoint(checkpointPath);
  if (resultsByEdition.size > 0) {
    console.log(`[lote] Checkpoint encontrado em ${checkpointPath} — ${resultsByEdition.size} edição(ões) já processada(s), serão puladas.`);
  }

  const pending = parsed.filter((entry) => !resultsByEdition.has(entry.editionNumber));
  console.log(`[lote] ${pending.length} edição(ões) a processar agora (concorrência=${concurrency}).`);

  let processedCount = 0;
  const total = pending.length;

  await processWithConcurrency(
    pending,
    concurrency,
    async ({ obj, editionNumber }) => investigateOne(editionNumber, obj.key, obj.size),
    (result) => {
      resultsByEdition.set(result.editionNumber, result);
      processedCount += 1;
      if (processedCount % 10 === 0 || processedCount === total) {
        saveCheckpoint(checkpointPath, resultsByEdition);
      }
      console.log(
        `[lote] (${processedCount}/${total}) edição ${result.editionNumber}: status=${result.status}, confiança=${result.confidence}` +
          (result.dateIso ? `, data=${result.dateIso}` : ""),
      );
    },
  );

  saveCheckpoint(checkpointPath, resultsByEdition);

  const allResults = Array.from(resultsByEdition.values());
  writeFileSync(outPath, toCsv(allResults), "utf8");

  const byStatus = (status: Status) => allResults.filter((r) => r.status === status).length;
  console.log(`\n[lote] Relatório CSV gravado em: ${outPath}`);
  console.log(`[lote] Checkpoint (retomável) em: ${checkpointPath}`);
  console.log(`[lote] Total processado: ${allResults.length} de ${parsed.length} edições reconhecidas no bucket.`);
  console.log(
    `[lote] Resumo por status: confirmada=${byStatus("confirmada")}, ` +
      `confirmada_sem_cruzamento_completo=${byStatus("confirmada_sem_cruzamento_completo")}, ` +
      `inconsistente=${byStatus("inconsistente")}, ambigua=${byStatus("ambigua")}, ` +
      `sem_data=${byStatus("sem_data")}, erro=${byStatus("erro")}`,
  );
  console.log("[lote] Nenhuma gravação foi feita no Supabase nem no R2. Nenhuma data foi estimada por periodicidade.");
}

main().catch((error) => {
  console.error("[lote] Erro:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
