/**
 * Investigação (não produção): tenta reconhecer a data real de publicação
 * de uma AMOSTRA de PDFs já existentes no R2 (acervo histórico), usando a
 * camada de texto do próprio PDF via @ir/pdf-extraction (pdfjs-dist já
 * usado no pipeline de extração de matérias — nenhuma lib nova).
 *
 * SOMENTE LEITURA: baixa bytes do R2 (GetObject já existente,
 * `getEditionPdfFromR2`), nunca grava nada no R2 nem no Supabase. Não
 * inventa data — quando a evidência não é clara, marca como pendente.
 *
 * Uso: npx tsx --env-file=.env.local scripts/investigate-edition-dates-sample.ts
 *      (precisa de NODE_OPTIONS="--conditions=react-server" por causa de
 *      "server-only" em editionArchive.r2.ts — ver nota no dry-run script)
 */
import { getEditionPdfFromR2, isEditionR2ReadConfigured } from "../src/providers/r2/editionArchive.r2";
import {
  findDateCandidates,
  pickBestCandidate,
  type Confidence,
  type DateCandidate,
} from "../src/providers/r2/editionDateRecognition";
import { loadPdfDocument, extractPageTextItems, hasTextLayer } from "@ir/pdf-extraction";
import { writeFileSync } from "node:fs";

const SAMPLE_EDITION_NUMBERS = [248, 250, 260, 320, 380, 450, 500, 550, 600, 650, 720, 776];

interface SampleResult {
  editionNumber: number;
  key: string;
  hasTextLayerPage1: boolean;
  hasTextLayerPage2: boolean;
  pagesChecked: number;
  candidates: DateCandidate[];
  bestCandidate: DateCandidate | null;
  confidence: Confidence;
  note: string;
}

async function investigateOne(editionNumber: number): Promise<SampleResult> {
  const key = `acervo/edicoes/IR ${editionNumber}.pdf`;
  const bytes = await getEditionPdfFromR2(key);
  const doc = await loadPdfDocument(bytes);

  const pageCount = Math.min(doc.numPages, 2);
  let fullText = "";
  let hasTextLayerPage1 = false;
  let hasTextLayerPage2 = false;
  const allCandidates: DateCandidate[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const items = await extractPageTextItems(page);
    const pageHasText = hasTextLayer(items);
    if (pageNumber === 1) hasTextLayerPage1 = pageHasText;
    if (pageNumber === 2) hasTextLayerPage2 = pageHasText;
    const pageText = items.map((item) => item.text).join(" ");
    fullText += `\n${pageText}`;
    allCandidates.push(...findDateCandidates(pageText, pageNumber));
  }

  const { best, confidence } = pickBestCandidate(allCandidates, fullText);

  let note = "";
  if (!hasTextLayerPage1 && !hasTextLayerPage2) {
    note = "PDF sem camada de texto pesquisável nas 2 primeiras páginas (provável digitalização/imagem) — precisaria de OCR, não executado nesta etapa.";
  } else if (!best) {
    note = "Nenhum padrão de data reconhecido nas 2 primeiras páginas.";
  } else if (confidence === "alta") {
    note = "Data completa (dia + mês por extenso + ano) encontrada, sem outra data completa divergente nas páginas verificadas.";
  } else if (confidence === "media") {
    note = "Evidência encontrada, mas ambígua (datas divergentes, ou numérica sem contexto de masthead claro) — requer confirmação humana.";
  } else {
    note = "Evidência insuficiente ou só parcial (ex.: dia da semana sem mês/ano) — marcado como pendente.";
  }

  return {
    editionNumber,
    key,
    hasTextLayerPage1,
    hasTextLayerPage2,
    pagesChecked: pageCount,
    candidates: allCandidates,
    bestCandidate: best,
    confidence,
    note,
  };
}

function toCsv(results: SampleResult[]): string {
  const header = [
    "edition_number",
    "key",
    "has_text_layer",
    "confidence",
    "best_date_normalized",
    "best_date_kind",
    "best_date_page",
    "evidence_snippet",
    "total_candidates",
    "note",
  ].join(",");

  const esc = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = results.map((r) =>
    [
      r.editionNumber,
      r.key,
      r.hasTextLayerPage1 || r.hasTextLayerPage2 ? "sim" : "nao",
      r.confidence,
      r.bestCandidate?.normalized ?? "",
      r.bestCandidate?.kind ?? "",
      r.bestCandidate?.page ?? "",
      r.bestCandidate?.snippet ?? "",
      r.candidates.length,
      r.note,
    ].map(esc).join(","),
  );

  return [header, ...lines].join("\n");
}

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

async function main() {
  if (!isEditionR2ReadConfigured()) {
    console.error("R2 de edições não está configurado para leitura. Nenhum valor exibido por segurança.");
    process.exitCode = 1;
    return;
  }

  const outPath = parseArg("out", "edition-dates-sample-investigation.csv");
  const results: SampleResult[] = [];

  for (const editionNumber of SAMPLE_EDITION_NUMBERS) {
    console.log(`[amostra] Investigando edição ${editionNumber}...`);
    try {
      const result = await investigateOne(editionNumber);
      results.push(result);
      console.log(
        `  -> texto: ${result.hasTextLayerPage1 || result.hasTextLayerPage2 ? "sim" : "não"}` +
          `, confiança: ${result.confidence}` +
          (result.bestCandidate ? `, data candidata: ${result.bestCandidate.normalized ?? result.bestCandidate.rawMatch}` : ""),
      );
    } catch (error) {
      console.error(`  -> erro ao processar edição ${editionNumber}:`, error instanceof Error ? error.message : error);
      results.push({
        editionNumber,
        key: `acervo/edicoes/IR ${editionNumber}.pdf`,
        hasTextLayerPage1: false,
        hasTextLayerPage2: false,
        pagesChecked: 0,
        candidates: [],
        bestCandidate: null,
        confidence: "baixa_ou_pendente",
        note: `Erro ao abrir/processar o PDF: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  writeFileSync(outPath, toCsv(results), "utf8");
  console.log(`\n[amostra] Relatório CSV gravado em: ${outPath}`);

  const highCount = results.filter((r) => r.confidence === "alta").length;
  const mediumCount = results.filter((r) => r.confidence === "media").length;
  const pendingCount = results.filter((r) => r.confidence === "baixa_ou_pendente").length;
  console.log(`[amostra] Resumo: alta=${highCount}, média=${mediumCount}, pendente/baixa=${pendingCount}`);
  console.log("[amostra] Nenhuma gravação foi feita no Supabase nem no R2.");
}

main().catch((error) => {
  console.error("[amostra] Erro:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
