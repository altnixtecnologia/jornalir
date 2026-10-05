export * from "./types";
export { extractPdf } from "./pipeline";
export { defaultOcrProvider, NullOcrProvider } from "./ocr";
export { assignSegment, detectColumns, detectColumnSegments } from "./columns";
export { checkConservation } from "./conservation";
export type { AlteredBlock, ConservationReport, DuplicatedBlock } from "./conservation";
// Baixo nível, sem a lógica de layout de jornal (colunas/grupos de
// artigo) — reaproveitado por outros fluxos que só precisam da camada de
// texto bruta de um PDF (ex.: extração conservadora de documentos do
// Financeiro, Parte 3A).
export { loadPdfDocument, hasTextLayer, extractPageTextItems } from "./textLayer";
