import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import type { TextItem } from "./types";

/**
 * Camada de texto do pdf.js, independente de ambiente (Node ou navegador):
 * só chama `page.getViewport`/`page.getTextContent`/`page.commonObjs.get`,
 * disponíveis em qualquer build do pdfjs-dist (legacy/Node ou browser).
 * Nunca importar `./pdfjsNode` aqui — isso quebraria o uso no navegador
 * (captura visual de matérias, `apps/sistema`, componente cliente).
 */

/** Verdadeiro quando a página tem camada de texto real (não apenas espaços/whitespace). */
export function hasTextLayer(items: TextItem[]): boolean {
  return items.some((item) => item.text.trim().length > 0);
}

/**
 * Extrai os itens de texto de uma página, já convertidos para o espaço de
 * página com origem no topo-esquerda (mais intuitivo para agrupar em linhas
 * de cima para baixo). Não junta, não reordena, não interpreta — apenas
 * normaliza coordenadas.
 */
export async function extractPageTextItems(page: PDFPageProxy): Promise<TextItem[]> {
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;
  const textContent = await page.getTextContent();

  const items: TextItem[] = [];
  for (const raw of textContent.items) {
    if (!("str" in raw)) continue; // ignora marcadores de estilo (TextMarkedContent)
    const transform = raw.transform;
    const fontSize = Math.hypot(transform[0], transform[1]) || raw.height || 1;
    items.push({
      text: raw.str,
      x: transform[4],
      yBaseline: pageHeight - transform[5],
      width: raw.width,
      fontSize,
      fontName: raw.fontName,
      hasEOL: Boolean(raw.hasEOL),
    });
  }
  return items;
}

/**
 * Preenche `realFontName` (nome da fonte embutida, com estilo: Bold,
 * Italic, Black…). Só funciona depois de `page.getOperatorList()`, que é
 * quando o pdf.js carrega as fontes; se o nome não estiver disponível, o
 * item fica sem ele e o modo jornal cai para regras só de tamanho.
 */
export function resolveRealFontNames(page: PDFPageProxy, items: TextItem[]): void {
  const cache = new Map<string, string | undefined>();
  for (const item of items) {
    if (!cache.has(item.fontName)) {
      let name: string | undefined;
      try {
        const font = page.commonObjs.get(item.fontName) as { name?: unknown } | undefined;
        name = typeof font?.name === "string" ? font.name : undefined;
      } catch {
        name = undefined;
      }
      cache.set(item.fontName, name);
    }
    item.realFontName = cache.get(item.fontName);
  }
}
