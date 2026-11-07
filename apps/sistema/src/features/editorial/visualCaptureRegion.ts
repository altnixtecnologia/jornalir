import type { TextItem } from "@ir/pdf-extraction";

/**
 * Geometria e cores da captura visual de matérias — utilitários puros,
 * independentes do pdf.js e do motor de extração (`@ir/pdf-extraction`).
 * NUNCA decide título/corpo: só recorta/converte retângulos. A decisão de
 * título/corpo continua inteiramente em `extractArticleFromRegion`
 * (`@ir/pdf-extraction`), chamada pelo modal com os itens já filtrados por
 * `filterItemsInRegion` abaixo.
 */

export interface NormalizedRect { x: number; y: number; width: number; height: number; }
export interface PointRect { x: number; y: number; width: number; height: number; }

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Retângulo normalizado (0..1 da página) a partir de dois pontos do arrasto — imune a zoom. */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): NormalizedRect {
  const x0 = clamp01(Math.min(a.x, b.x));
  const x1 = clamp01(Math.max(a.x, b.x));
  const y0 = clamp01(Math.min(a.y, b.y));
  const y1 = clamp01(Math.max(a.y, b.y));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Fração da área do menor retângulo coberta pela interseção — usada para recusar seleções quase idênticas. */
export function overlapRatio(a: NormalizedRect, b: NormalizedRect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const area = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller ? area / smaller : 0;
}

/** Converte o retângulo normalizado (0..1) para pontos do PDF — mesmo espaço de `TextItem.x`/`yBaseline` (escala 1, `extractPageTextItems`). */
export function normalizedRectToPoints(rect: NormalizedRect, pageWidth: number, pageHeight: number): PointRect {
  return { x: rect.x * pageWidth, y: rect.y * pageHeight, width: rect.width * pageWidth, height: rect.height * pageHeight };
}

/**
 * Restringe os itens de texto da página ao retângulo (em pontos) — só os
 * itens cujo CENTRO aproximado cai dentro dele entram na extração. Nunca
 * mistura itens de fora da seleção (item 7 do pedido: "sem tentar misturar
 * outras colunas ou elementos externos").
 */
export function filterItemsInRegion(items: TextItem[], rect: PointRect): TextItem[] {
  return items.filter((item) => {
    const cx = item.x + item.width / 2;
    // Aproximação do centro vertical do glifo a partir da linha de base
    // (TextItem não guarda altura própria — mesmo critério usado no motor
    // de layout para `yTop` a partir de `yBaseline`/`fontSize`).
    const cy = item.yBaseline - item.fontSize * 0.35;
    return cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height;
  });
}

const SELECTION_COLORS = ["#2563eb", "#059669", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#c026d3", "#65a30d"];

/** Cor estável por número de matéria (repete após 8, igual ao padrão de qualquer paleta cíclica). */
export function selectionColor(index: number): string {
  return SELECTION_COLORS[index % SELECTION_COLORS.length];
}
