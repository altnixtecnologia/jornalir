import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { cMapUrl, getDocument, standardFontDataUrl } from "./pdfjsNode";
import type { TextItem } from "./types";

/** Abre o documento a partir dos bytes (arquivo temporário/local — nada é persistido aqui). */
export async function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const loadingTask = getDocument({
    data: bytes,
    // Build "legacy" do pdfjs-dist já roda sem worker real em Node; desabilitar
    // fontes do sistema evita tentativas de acesso a recursos indisponíveis no servidor.
    useSystemFonts: false,
    isEvalSupported: false,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
  });
  return loadingTask.promise;
}

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
