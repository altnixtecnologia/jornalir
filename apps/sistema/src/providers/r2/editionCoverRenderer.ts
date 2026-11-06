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
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, DOMMatrix, Path2D, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";

/**
 * Histórico real (produção, Vercel, projeto jornalir-sistema) — três
 * tentativas de correção anteriores falharam com a MESMA classe de erro
 * (`ERR_INVALID_ARG_TYPE`, `dirname()` recebendo um número em vez de um
 * caminho), todas baseadas em "require .resolve" do pacote pdfjs-dist
 * sob alguma forma:
 *
 * 1) Direto, variável chamada `require`: webpack reescreve a chamada
 *    estaticamente para o ID numérico do módulo no bundle (digest
 *    2211172284).
 * 2) Renomeado com fallback (`realRequire = __non_webpack_require__ ??
 *    require`): a referência nua à variável `require` virou um
 *    módulo-stub `Cannot find module` no bundle (digest 2130500082).
 * 3) Renomeado sem fallback, e depois isolando `.resolve()` dentro de uma
 *    `Function` construída em runtime: comprovado reconstruindo o bundle
 *    de produção que, de um jeito ou de outro, QUALQUER referência ao
 *    valor devolvido por `createRequire(...)` que não seja chamá-lo direto
 *    com uma string literal — inclusive só passá-lo como argumento — é
 *    reescrita pelo webpack (vira um número ou um módulo-stub).
 *
 * Correção real: abandonar `require.resolve()` por completo. Usamos apenas
 * `import.meta.url` (uma string — webpack a substitui pelo caminho real do
 * arquivo em texto puro, sem nenhuma reescrita especial, confirmado no
 * bundle compilado) e funções simples de `node:fs`/`node:path`, subindo os
 * diretórios a partir deste arquivo até achar `node_modules/pdfjs-dist` —
 * o mesmo algoritmo que o Node usa internamente para resolver módulos, só
 * que escrito à mão, sem tocar em `require`. Nada aqui é um padrão que o
 * webpack reconheça como "resolução de módulo" para reescrever. Comprovado
 * reconstruindo o bundle de produção e executando o módulo de verdade —
 * ver test/edition-cover-renderer-init.test.ts.
 */
const pdfjsRequire = createRequire(import.meta.url);

function findPdfjsDistRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
    const candidate = join(dir, "node_modules", "pdfjs-dist");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `pdfjs-dist não encontrado em nenhum node_modules a partir de ${dirname(fileURLToPath(import.meta.url))}`,
  );
}

interface PdfjsAssets {
  getDocument: typeof import("pdfjs-dist/types/src/pdf").getDocument;
  standardFontDataUrl: string;
  cMapUrl: string;
}

let cachedPdfjsAssets: PdfjsAssets | null = null;

/**
 * Carregada apenas quando uma capa é realmente renderizada (não na
 * avaliação do módulo) — reduz a chance de qualquer problema de resolução
 * de caminho quebrar a Server Action antes de qualquer ação do operador, e
 * facilita isolar esta etapa em diagnóstico futuro.
 */
function loadPdfjsAssets(): PdfjsAssets {
  if (cachedPdfjsAssets) return cachedPdfjsAssets;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLegacy = pdfjsRequire("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/types/src/pdf");
  const pdfjsRoot = findPdfjsDistRoot();

  cachedPdfjsAssets = {
    getDocument: pdfjsLegacy.getDocument,
    standardFontDataUrl: join(pdfjsRoot, "standard_fonts") + "/",
    cMapUrl: join(pdfjsRoot, "cmaps") + "/",
  };
  return cachedPdfjsAssets;
}

// Algumas páginas usam operações (clipping/patterns) que o pdfjs-dist invoca
// via `new DOMMatrix()`/`new Path2D()` diretamente, fora do canvasFactory —
// sem isso, falham com "DOMMatrix/Path2D is not defined" (visto nas edições
// 470, 573 e 574 durante a geração completa das 497 capas).
if (!("DOMMatrix" in globalThis)) (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
if (!("Path2D" in globalThis)) (globalThis as Record<string, unknown>).Path2D = Path2D;

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
  const { getDocument, standardFontDataUrl, cMapUrl } = loadPdfjsAssets();

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
