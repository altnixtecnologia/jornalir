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

/**
 * Uma coluna válida apenas dentro de uma faixa vertical da página (não a
 * página inteira) — permite que regiões diferentes tenham estruturas de
 * coluna diferentes (ex.: matéria larga ao lado de uma coluna estreita por
 * parte da altura da página). Ver `detectColumnSegments` em `columns.ts`.
 */
export interface ColumnSegment {
  yTop: number;
  yBottom: number;
  xStart: number;
  xEnd: number;
}

export interface Paragraph {
  /** Identidade estável dentro da página (ex.: "c0-p2") — permite rastrear até o candidato final. */
  id: string;
  column: number;
  text: string;
  x: number;
  width: number;
  yTop: number;
  yBottom: number;
  fontSize: number;
}

export type ArticleRole = "title" | "subtitle" | "body";

export interface ArticleBlock {
  /** Aponta para o parágrafo de origem (Paragraph.id) — base da checagem de conservação. */
  paragraphId: string;
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
  /** Colunas detectadas por região vertical da página (Fase 11) — pode haver estruturas diferentes em faixas distintas da mesma página. Cada segmento equivale ao que a Fase 09 chamava de "coluna". */
  columnSegments: ColumnSegment[];
  /** Catálogo completo de parágrafos detectados na página — base de verdade para a checagem de conservação (ver conservation.ts). Vazio quando `method !== "textLayer"`. */
  paragraphs: Paragraph[];
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
