import { checkConservation, extractPdf } from "@ir/pdf-extraction";
import type { ArticleGroup, ConservationReport, PageExtraction } from "@ir/pdf-extraction";
import type { NewImportCandidateRecord } from "@ir/core";
import type { ImportCandidate, ImportPageCoverage, ImportSourceBlock } from "@ir/types";
import { articleService, importCandidateService } from "./editorial";

// Re-exportados para que qualquer consumidor (Server Actions, scripts de
// validação) possa importar os serviços editoriais a partir deste mesmo
// módulo sem precisar de um segundo caminho relativo até ./editorial.
export { articleService, importCandidateService };

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Corpo como HTML (mesma convenção do editor de texto da Fase 07): um `<p>` por bloco de corpo, sem reescrever o texto. */
function bodyBlocksToHtml(group: ArticleGroup): string {
  return group.blocks
    .filter((block) => block.role === "body")
    .map((block) => `<p>${escapeHtml(block.text)}</p>`)
    .join("");
}

function toSourceBlocks(group: ArticleGroup, page: PageExtraction): ImportSourceBlock[] {
  return group.blocks.map((block) => ({
    page: page.pageNumber,
    column: group.column,
    role: block.role,
    text: block.text,
    x: block.x,
    y: block.y,
    width: block.width,
    fontSize: block.fontSize,
  }));
}

/** Avisos específicos deste candidato (dos sinalizadores do próprio grupo) + avisos da página que não são de outro grupo. */
function buildCandidateWarnings(group: ArticleGroup, page: PageExtraction): string[] {
  const warnings: string[] = [];
  if (group.lowConfidenceTitle) {
    warnings.push(
      "Não foi possível identificar título com segurança; conteúdo mantido integralmente no corpo para revisão.",
    );
  }
  if (group.possibleContinuation) {
    warnings.push(
      "O último parágrafo não termina com pontuação de fechamento — possível continuação em outra coluna/página.",
    );
  }
  if (group.possibleAdvertisement) {
    warnings.push("Bloco curto e isolado por grandes vãos — possível publicidade; verifique antes de converter.");
  }
  const groupSpecificPatterns = ["possível continuação", "possível publicidade", "não foi possível identificar título"];
  const pageLevelOnly = page.warnings.filter(
    (warning) => !groupSpecificPatterns.some((pattern) => warning.includes(pattern)),
  );
  warnings.push(...pageLevelOnly);
  return warnings;
}

function toPageCoverage(conservation: ConservationReport): ImportPageCoverage {
  return {
    blocksFound: conservation.blocksFound,
    blocksUsed: conservation.blocksUsed,
    orphanBlocks: conservation.orphanBlocks.length,
    coverageByCount: conservation.coverageByCount,
    coverageByChars: conservation.coverageByChars,
  };
}

function articleGroupToRecord(
  editionId: string,
  page: PageExtraction,
  group: ArticleGroup,
  pageCoverage: ImportPageCoverage,
): NewImportCandidateRecord {
  const titleBlock = group.blocks.find((block) => block.role === "title");
  const subtitleBlock = group.blocks.find((block) => block.role === "subtitle");

  return {
    editionId,
    pageNumber: page.pageNumber,
    suggestedTitle: titleBlock?.text,
    suggestedSubtitle: subtitleBlock?.text,
    suggestedBody: bodyBlocksToHtml(group),
    suggestedSectionId: undefined,
    suggestedLocalityId: undefined,
    suggestedMediaAssetIds: [],
    status: "pending",
    extraction: {
      method: page.method === "textLayer" ? "textLayer" : page.method === "ocr" ? "ocr" : "manual",
      pageWidth: page.pageWidth,
      pageHeight: page.pageHeight,
      blocks: toSourceBlocks(group, page),
      warnings: buildCandidateWarnings(group, page),
      lowConfidenceTitle: group.lowConfidenceTitle,
      possibleContinuation: group.possibleContinuation,
      possibleAdvertisement: group.possibleAdvertisement,
      pageCoverage,
    },
  };
}

export interface ExtractCandidatesResult {
  candidates: ImportCandidate[];
  pageCount: number;
  pagesWithoutText: number[];
  warnings: string[];
}

/**
 * Lê o PDF de verdade (arquivo temporário/local, nunca persistido) e gera
 * candidatos reais a partir do texto/layout extraído — substitui o gerador
 * mock da Fase 08. Nenhum candidato é publicado; todos nascem "pending".
 */
export async function extractCandidatesFromPdf(
  editionId: string,
  pdfBytes: Uint8Array,
): Promise<ExtractCandidatesResult> {
  const result = await extractPdf(pdfBytes);

  const records: NewImportCandidateRecord[] = [];
  const pagesWithoutText: number[] = [];
  for (const page of result.pages) {
    if (page.method === "unavailable") {
      pagesWithoutText.push(page.pageNumber);
      continue;
    }
    const pageCoverage = toPageCoverage(checkConservation(page));
    for (const group of page.articleGroups) {
      records.push(articleGroupToRecord(editionId, page, group, pageCoverage));
    }
  }

  const candidates = await importCandidateService.createBatch(records);
  return { candidates, pageCount: result.pageCount, pagesWithoutText, warnings: result.warnings };
}
