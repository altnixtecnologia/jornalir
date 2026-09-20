import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { OPS } from "./pdfjsNode";

const IMAGE_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObjectRepeat,
]);

/**
 * Conta imagens candidatas na página (detecção, não extração de pixels —
 * relacionar à página basta nesta fase; ver docs/HANDOFF-CODEX.md para a
 * justificativa de não perseguir associação perfeita de imagem/bloco aqui).
 */
export async function countPageImages(page: PDFPageProxy): Promise<number> {
  const operatorList = await page.getOperatorList();
  let count = 0;
  for (const op of operatorList.fnArray) {
    if (IMAGE_OPS.has(op)) count += 1;
  }
  return count;
}
