import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { cMapUrl, getDocument, standardFontDataUrl } from "./pdfjsNode";

// `extractPageTextItems`/`resolveRealFontNames`/`hasTextLayer` moram em
// `./textItems` (puro, sem Node) desde 07/11/2026, para serem reaproveitados
// também no navegador (captura visual de matérias, `apps/sistema`). Este
// módulo continua a reexportar os três com a mesma assinatura — nenhum
// importador existente (pipeline.ts, apps/sistema) precisa mudar.
export { extractPageTextItems, hasTextLayer, resolveRealFontNames } from "./textItems";

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
