import { assignSegment, detectColumnSegments } from "./columns";
import { checkConservation } from "./conservation";
import { countPageImages } from "./images";
import { groupItemsIntoLines } from "./lines";
import { computeBodyFontSize, groupParagraphsIntoArticles } from "./articleGroups";
import { groupLinesIntoParagraphs } from "./paragraphs";
import { extractPageTextItems, hasTextLayer, loadPdfDocument } from "./textLayer";
import { findSuspiciousCharacters, hasIsolatedLowercaseInUppercaseRun } from "./warnings";
import { defaultOcrProvider } from "./ocr";
import type { OcrProvider, PageExtraction, PdfExtractionResult, TextItem } from "./types";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";

export interface ExtractPdfOptions {
  ocrProvider?: OcrProvider;
}

/**
 * Pipeline: PDF → páginas → blocos com coordenadas → agrupamento →
 * candidatos. Nunca inventa, completa ou reescreve texto — apenas organiza o
 * que foi lido. Ver docs/HANDOFF-CODEX.md (Fase 09) para o detalhamento de
 * cada etapa e suas limitações deliberadas.
 */
export async function extractPdf(
  bytes: Uint8Array,
  options: ExtractPdfOptions = {},
): Promise<PdfExtractionResult> {
  const ocrProvider = options.ocrProvider ?? defaultOcrProvider;
  const document = await loadPdfDocument(bytes);
  const pages: PageExtraction[] = [];
  const documentWarnings: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        pages.push(await extractPage(page, pageNumber, ocrProvider));
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await document.destroy();
  }

  return { pageCount: document.numPages, pages, warnings: documentWarnings };
}

async function extractPage(
  page: PDFPageProxy,
  pageNumber: number,
  ocrProvider: OcrProvider,
): Promise<PageExtraction> {
  const viewport = page.getViewport({ scale: 1 });
  const items: TextItem[] = await extractPageTextItems(page);
  const imageCount = await countPageImages(page);
  const warnings: string[] = [];

  if (!hasTextLayer(items)) {
    const ocrAvailable = await ocrProvider.isAvailable();
    if (!ocrAvailable) {
      warnings.push(
        `Página ${pageNumber} não tem camada de texto e nenhum provedor de OCR está disponível nesta instalação; conteúdo precisa ser revisado/digitado manualmente.`,
      );
      return {
        pageNumber,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
        method: "unavailable",
        columnSegments: [],
        paragraphs: [],
        articleGroups: [],
        imageCount,
        warnings,
      };
    }

    const ocrResult = await ocrProvider.recognizePage(new Uint8Array(), pageNumber);
    if (!ocrResult) {
      warnings.push(`Página ${pageNumber}: OCR não retornou texto; revisão manual necessária.`);
      return {
        pageNumber,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
        method: "unavailable",
        columnSegments: [],
        paragraphs: [],
        articleGroups: [],
        imageCount,
        warnings,
      };
    }

    warnings.push(
      `Página ${pageNumber}: texto obtido por OCR (confiança ${(ocrResult.confidence * 100).toFixed(0)}%) — não é garantidamente exato, revise com atenção.`,
    );
    const ocrParagraphId = "c0-p0";
    return {
      pageNumber,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      method: "ocr",
      columnSegments: [],
      paragraphs: [
        {
          id: ocrParagraphId,
          column: 0,
          text: ocrResult.text,
          x: 0,
          width: viewport.width,
          yTop: 0,
          yBottom: 0,
          fontSize: 0,
        },
      ],
      articleGroups: [
        {
          column: 0,
          blocks: [
            { paragraphId: ocrParagraphId, role: "body", text: ocrResult.text, x: 0, y: 0, width: viewport.width, fontSize: 0 },
          ],
          lowConfidenceTitle: true,
          possibleContinuation: false,
          possibleAdvertisement: false,
        },
      ],
      imageCount,
      warnings,
    };
  }

  for (const item of items) {
    const suspicious = findSuspiciousCharacters(item.text);
    for (const warning of suspicious) {
      const message = `Página ${pageNumber}: ${warning} em "${item.text.slice(0, 40)}"`;
      if (!warnings.includes(message)) warnings.push(message);
    }
  }

  const columnSegments = detectColumnSegments(items, viewport.width, viewport.height);
  const itemsByColumn: TextItem[][] = columnSegments.map(() => []);
  for (const item of items) {
    if (item.text.trim().length === 0) continue;
    itemsByColumn[assignSegment(item, columnSegments)].push(item);
  }

  const paragraphsByColumn = itemsByColumn.map((columnItems, column) =>
    groupLinesIntoParagraphs(groupItemsIntoLines(columnItems), column),
  );
  const paragraphs = paragraphsByColumn.flat();
  const bodyFontSize = computeBodyFontSize(paragraphs);

  for (const paragraph of paragraphs) {
    if (hasIsolatedLowercaseInUppercaseRun(paragraph.text)) {
      warnings.push(
        `Página ${pageNumber}: possível letra maiúscula mapeada incorretamente pela fonte em "${paragraph.text.slice(0, 60)}" — comum em fontes de título com CID/Unicode malformado; confira visualmente antes de usar.`,
      );
    }
  }

  const articleGroups = paragraphsByColumn.flatMap((columnParagraphs, column) =>
    groupParagraphsIntoArticles(columnParagraphs, column, bodyFontSize),
  );

  for (const group of articleGroups) {
    if (group.lowConfidenceTitle) {
      warnings.push(
        `Página ${pageNumber}, coluna ${group.column + 1}: não foi possível identificar título com segurança; conteúdo mantido integralmente no corpo para revisão.`,
      );
    }
    if (group.possibleContinuation) {
      warnings.push(
        `Página ${pageNumber}, coluna ${group.column + 1}: o último parágrafo não termina com pontuação de fechamento — possível continuação em outra coluna/página.`,
      );
    }
    if (group.possibleAdvertisement) {
      warnings.push(
        `Página ${pageNumber}, coluna ${group.column + 1}: bloco curto e isolado por grandes vãos — possível publicidade, verifique antes de converter.`,
      );
    }
  }

  const pageExtraction: PageExtraction = {
    pageNumber,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    method: "textLayer",
    columnSegments,
    paragraphs,
    articleGroups,
    imageCount,
    warnings,
  };

  // Auditoria independente: nunca decide nada, só mede e relata — os avisos
  // entram na mesma lista para não criar um segundo canal de aviso oculto.
  const conservation = checkConservation(pageExtraction);
  pageExtraction.warnings.push(...conservation.warnings);

  return pageExtraction;
}
