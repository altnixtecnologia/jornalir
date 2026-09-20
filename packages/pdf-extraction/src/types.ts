// Tipos internos do pipeline de extração. Não são o domínio editorial
// (@ir/types) — são a representação de trabalho entre "PDF" e "candidato".

/** Item de texto bruto, já normalizado para espaço de página com origem no
 * topo-esquerda (y cresce para baixo) e posição pela linha de base. */
export interface TextItem {
  text: string;
  x: number;
  yBaseline: number;
  width: number;
  fontSize: number;
  fontName: string;
  hasEOL: boolean;
}

export interface Line {
  text: string;
  x: number;
  yBaseline: number;
  width: number;
  fontSize: number;
}

export interface Paragraph {
  text: string;
  x: number;
  width: number;
  yTop: number;
  yBottom: number;
  fontSize: number;
}

export type ArticleRole = "title" | "subtitle" | "body";

export interface ArticleBlock {
  role: ArticleRole;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

/** Um candidato a matéria dentro de uma coluna de uma página. */
export interface ArticleGroup {
  column: number;
  blocks: ArticleBlock[];
  lowConfidenceTitle: boolean;
  possibleContinuation: boolean;
  /** Bloco curto e isolado por grandes vãos — sinal de possível publicidade, nunca decidido automaticamente. */
  possibleAdvertisement: boolean;
}

export type PageExtractionMethod = "textLayer" | "ocr" | "unavailable";

export interface PageExtraction {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  method: PageExtractionMethod;
  columnRanges: Array<[number, number]>;
  articleGroups: ArticleGroup[];
  imageCount: number;
  warnings: string[];
}

export interface PdfExtractionResult {
  pageCount: number;
  pages: PageExtraction[];
  warnings: string[];
}

/** Ponto de extensão para OCR: nenhuma implementação real nesta fase (ver ocr.ts). */
export interface OcrProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  recognizePage(pdfBytes: Uint8Array, pageNumber: number): Promise<{ text: string; confidence: number } | null>;
}
