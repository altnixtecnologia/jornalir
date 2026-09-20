/**
 * Diagnóstico do pipeline contra edições reais do JornalIR já existentes no
 * acervo (`apps/site/public/uploads/jornal-online/`). Só leitura — nunca
 * altera nem move os PDFs. Produz um retrato objetivo em JSON no stdout;
 * `docs/PDF-REAL-VALIDATION.md` é escrito a partir desses números (não
 * gerado automaticamente por este script, para manter o relatório legível e
 * comentado por um humano em vez de texto dump bruto).
 *
 * Uso: de dentro de packages/pdf-extraction, `npx tsx scripts/validate-real-pdfs.ts`.
 */
import { readFileSync } from "node:fs";
import { checkConservation, extractPdf } from "../src/index";
import type { ConservationReport, PageExtraction } from "../src/index";

const ARCHIVE_DIR = "../../apps/site/public/uploads/jornal-online/";

/**
 * Páginas escolhidas a dedo (não todas as páginas de todas as edições) para
 * cobrir os cenários pedidos: uma matéria; várias matérias; duas ou mais
 * colunas; anúncios entre matérias; títulos grandes; subtítulos; textos
 * longos; acentos; continuações — mapeadas a partir de uma inspeção prévia
 * (contagem de itens/colunas) de todas as 24 páginas das 7 edições
 * disponíveis.
 */
const SELECTED_PAGES: Array<{ file: string; page: number; why: string }> = [
  { file: "IR 685_compressed.pdf", page: 1, why: "capa — pouco texto, manchete grande, título dominante" },
  { file: "IR 685_compressed.pdf", page: 4, why: "coluna única densa — várias matérias, textos longos, acentos" },
  { file: "IR 685_compressed.pdf", page: 5, why: "página inteira de publicidade (rótulo 'Publicidade' na própria página) — caso limite de baixo volume de texto" },
  { file: "IR 685_compressed.pdf", page: 12, why: "duas colunas detectadas" },
  { file: "IR 685_compressed.pdf", page: 18, why: "duas colunas detectadas, volume moderado" },
  { file: "IR 685_compressed.pdf", page: 23, why: "maior volume de caracteres da edição — texto longo, provável coluna de classificados/notas" },
  { file: "IR 697_compressed.pdf", page: 20, why: "duas colunas em edição diferente, para comparar consistência entre edições" },
  { file: "IR 699_compressed.pdf", page: 18, why: "3 colunas detectadas com volume moderado (não quase vazia) — caso a verificar" },
];

interface PageDiagnostic {
  file: string;
  page: number;
  why: string;
  columns: number;
  regions: number;
  candidates: number;
  method: PageExtraction["method"];
  imageCount: number;
  coverageByCount: number;
  coverageByChars: number;
  orphanBlocks: number;
  duplicatedBlocks: number;
  alteredBlocks: number;
  reorderedBlocks: number;
  candidateSummaries: Array<{
    column: number;
    title: string | null;
    bodyChars: number;
    lowConfidenceTitle: boolean;
    possibleContinuation: boolean;
    possibleAdvertisement: boolean;
  }>;
  pipelineWarnings: string[];
}

function summarizePage(pageEntry: (typeof SELECTED_PAGES)[number], page: PageExtraction, conservation: ConservationReport): PageDiagnostic {
  return {
    file: pageEntry.file,
    page: pageEntry.page,
    why: pageEntry.why,
    columns: page.columnSegments.length,
    regions: new Set(page.columnSegments.map((s) => `${s.yTop}-${s.yBottom}`)).size,
    candidates: page.articleGroups.length,
    method: page.method,
    imageCount: page.imageCount,
    coverageByCount: conservation.coverageByCount,
    coverageByChars: conservation.coverageByChars,
    orphanBlocks: conservation.orphanBlocks.length,
    duplicatedBlocks: conservation.duplicatedBlocks.length,
    alteredBlocks: conservation.alteredBlocks.length,
    reorderedBlocks: conservation.reorderedBlockIds.length,
    candidateSummaries: page.articleGroups.map((group) => ({
      column: group.column,
      title: group.blocks.find((b) => b.role === "title")?.text ?? null,
      bodyChars: group.blocks.filter((b) => b.role === "body").reduce((sum, b) => sum + b.text.length, 0),
      lowConfidenceTitle: group.lowConfidenceTitle,
      possibleContinuation: group.possibleContinuation,
      possibleAdvertisement: group.possibleAdvertisement,
    })),
    pipelineWarnings: page.warnings,
  };
}

async function main(): Promise<void> {
  const byFile = new Map<string, typeof SELECTED_PAGES>();
  for (const entry of SELECTED_PAGES) {
    const list = byFile.get(entry.file) ?? [];
    list.push(entry);
    byFile.set(entry.file, list);
  }

  const diagnostics: PageDiagnostic[] = [];

  for (const [file, entries] of byFile) {
    const bytes = readFileSync(ARCHIVE_DIR + file);
    const result = await extractPdf(new Uint8Array(bytes));
    for (const entry of entries) {
      const page = result.pages.find((p) => p.pageNumber === entry.page);
      if (!page) {
        console.error(`AVISO: página ${entry.page} não encontrada em ${file} (documento tem ${result.pageCount} páginas)`);
        continue;
      }
      const conservation = checkConservation(page);
      diagnostics.push(summarizePage(entry, page, conservation));
    }
  }

  console.log(JSON.stringify(diagnostics, null, 2));
}

main().catch((error) => {
  console.error("ERRO INESPERADO:", error);
  process.exitCode = 1;
});
