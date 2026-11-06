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
 * Evolução: abandonar `require.resolve()` por completo evitou o ID
 * numérico do webpack, mas ainda houve falha ao localizar os assets do
 * PDF.js: `import.meta.url` foi preservado como caminho de build
 * (/vercel/path0), inexistente em runtime (/var/task). A busca abaixo usa
 * primeiro LAMBDA_TASK_ROOT/process.cwd(), e não bloqueia a renderização
 * quando arquivos auxiliares opcionais não foram empacotados.
 * O PDF principal continua carregado pela dependência pdfjs-dist.
 */
const pdfjsRequire = createRequire(import.meta.url);

function findPdfjsDistRoot(): string {
  // Na Vercel, import.meta.url pode manter o caminho da máquina de BUILD
  // (/vercel/path0), que não existe na função publicada (/var/task).
  // Procurar primeiro a partir do diretório real de execução da função.
  const origins = [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    dirname(fileURLToPath(import.meta.url)),
  ];
  for (const origin of origins) {
    if (!origin) continue;
    let dir = origin;
    for (let i = 0; i < 12; i += 1) {
      const candidates = [
        join(dir, "node_modules", "pdfjs-dist"),
        join(dir, "apps", "sistema", "node_modules", "pdfjs-dist"),
      ];
      for (const candidate of candidates) {
        if (existsSync(join(candidate, "package.json"))) return candidate;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  // cmaps/ e standard_fonts/ são recursos OPCIONAIS do PDF.js.
  // Não impedir a geração da capa quando o empacotador serverless não os
  // incluiu. O próprio PDF (em geral com fontes incorporadas) ainda pode
  // ser renderizado; emitir os avisos normais do PDF.js se precisar deles.
  return "";
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
    standardFontDataUrl: pdfjsRoot && existsSync(join(pdfjsRoot, "standard_fonts"))
      ? join(pdfjsRoot, "standard_fonts") + "/"
      : "",
    cMapUrl: pdfjsRoot && existsSync(join(pdfjsRoot, "cmaps"))
      ? join(pdfjsRoot, "cmaps") + "/"
      : "",
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
    // Se os diretórios auxiliares não estiverem no bundle serverless, não
    // passar caminhos inválidos ao PDF.js; fontes incorporadas funcionam.
    ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
    ...(cMapUrl ? { cMapUrl, cMapPacked: true } : {}),
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
