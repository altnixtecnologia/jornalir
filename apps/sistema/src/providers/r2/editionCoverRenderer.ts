/**
 * Renderização (preparação, não lote) da capa de uma edição — página 1 do
 * PDF convertida para WebP. Usa pdfjs-dist (já dependência do projeto,
 * Apache-2.0) + @napi-rs/canvas (MIT, binários pré-compilados, sem precisar
 * de Cairo/GTK/toolchain nativo no Windows) + sharp (já dependência do
 * projeto, usado em mediaStorage.r2.ts). Todas as licenças são compatíveis
 * com um projeto proprietário — ver comparação com `mupdf` (AGPL-3.0, exige
 * licença comercial da Artifex para uso proprietário) em
 * docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md.
 *
 * FUNÇÃO PURA EM TERMOS DE I/O EXTERNO: recebe bytes já baixados do R2
 * (pelo chamador) e devolve o buffer WebP em memória — nunca grava no R2
 * nem decide onde persistir. O chamador (script de preparação/lote) decide
 * se grava localmente ou envia a algum lugar.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createCanvas, DOMMatrix, Path2D, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";

// Algumas páginas usam operações (clipping/patterns) que o pdfjs-dist invoca
// via `new DOMMatrix()`/`new Path2D()` diretamente, fora do canvasFactory —
// sem isso, falham com "DOMMatrix/Path2D is not defined" (visto nas edições
// 470, 573 e 574 durante a geração completa das 497 capas).
if (!("DOMMatrix" in globalThis)) (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
if (!("Path2D" in globalThis)) (globalThis as Record<string, unknown>).Path2D = Path2D;

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLegacy = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/types/src/pdf");
const { getDocument } = pdfjsLegacy;

/**
 * `require.resolve(x)` dentro de um bundle webpack (como o build de Server
 * Actions do Next.js na Vercel) NUNCA devolve um caminho de arquivo real —
 * webpack intercepta a chamada estaticamente e devolve o ID numérico do
 * módulo no bundle (ex.: 43899). `dirname()` em cima desse número quebra em
 * produção com `ERR_INVALID_ARG_TYPE` (confirmado nos logs reais da Vercel,
 * 05/11/2026, ao reaproveitar o PDF da edição 776 — a renderização da capa
 * nunca chegava a rodar). `__non_webpack_require__` é a forma documentada do
 * próprio webpack de pedir a resolução REAL do Node, sem a reescrita
 * estática — existe apenas quando o código passa pelo bundler; fora dele
 * (scripts via `tsx`, testes) a variável não existe, por isso o fallback
 * para `require` normal, cujo `.resolve()` já é o real do Node nesses casos.
 */
declare const __non_webpack_require__: NodeRequire | undefined;
const realRequire: NodeRequire =
  typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : require;

const pdfjsRoot = dirname(realRequire.resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = join(pdfjsRoot, "standard_fonts") + "/";
const cMapUrl = join(pdfjsRoot, "cmaps") + "/";

interface CanvasAndContext {
  canvas: Canvas | null;
  context: SKRSContext2D | null;
}

/**
 * Substitui o `NodeCanvasFactory` padrão do pdfjs-dist (que faz
 * `require("canvas")` incondicionalmente dentro de `_createCanvas`, mesmo
 * quando um `canvasContext` próprio é passado para `page.render()` — ver
 * node_modules/pdfjs-dist/legacy/build/pdf.js, classe `NodeCanvasFactory`).
 * Sem esta substituição, a renderização de página falha com
 * "Cannot find module 'canvas'" em qualquer máquina sem o pacote nativo
 * `canvas` (node-canvas/Cairo) instalado — confirmado em teste real nesta
 * máquina Windows, sem toolchain de build nativo disponível.
 */
class NapiCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: CanvasAndContext): void {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export interface RenderEditionCoverOptions {
  /** Largura alvo em pixels da miniatura (altura calculada proporcionalmente). Padrão: 600px. */
  targetWidth?: number;
  /** Qualidade WebP (0-100). Padrão: 82. */
  webpQuality?: number;
}

export interface RenderedEditionCover {
  webpBuffer: Buffer;
  widthPx: number;
  heightPx: number;
}

/** Renderiza a página 1 de um PDF de edição (bytes já em memória) em WebP. Não acessa R2 nem Supabase. */
export async function renderEditionCoverWebp(
  pdfBytes: Uint8Array,
  options: RenderEditionCoverOptions = {},
): Promise<RenderedEditionCover> {
  const targetWidth = options.targetWidth ?? 600;
  const webpQuality = options.webpQuality ?? 82;

  const canvasFactory = new NapiCanvasFactory();
  const loadingTask = getDocument({
    data: pdfBytes,
    useSystemFonts: false,
    isEvalSupported: false,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    canvasFactory: canvasFactory as never,
  });

  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const viewportDefault = page.getViewport({ scale: 1 });
    const scale = targetWidth / viewportDefault.width;
    const viewport = page.getViewport({ scale });

    const { canvas, context } = canvasFactory.create(Math.round(viewport.width), Math.round(viewport.height));
    const renderParams = { canvasContext: context, viewport, canvasFactory } as unknown as Parameters<typeof page.render>[0];
    await page.render(renderParams).promise;

    const pngBuffer = (canvas as NonNullable<typeof canvas>).toBuffer("image/png");
    const webpBuffer = await sharp(pngBuffer).webp({ quality: webpQuality }).toBuffer();

    return { webpBuffer, widthPx: Math.round(viewport.width), heightPx: Math.round(viewport.height) };
  } finally {
    await doc.destroy();
  }
}
