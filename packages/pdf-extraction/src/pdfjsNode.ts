import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `require` explícito (não `import` ESM) é deliberado: pdfjs-dist/legacy é
// CommonJS, e o interop padrão do Node para "default export" de um módulo
// CJS varia conforme o "type" do package.json mais próximo de quem importa
// (apps/sistema não declara "type": "module"; este pacote declara). Usar
// `require` sempre retorna o mesmo `module.exports`, independente de quem
// chama — evita quebra silenciosa da desestruturação de `OPS`/`getDocument`.
//
// Só chamadas DIRETAS com string literal: dentro do bundle do Next (webpack),
// `require.resolve(...)` vira ID numérico do módulo e `dirname()` quebra com
// ERR_INVALID_ARG_TYPE — mesmo histórico de
// apps/sistema/src/providers/r2/editionCoverRenderer.ts.
const pdfjsRequire = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLegacy = pdfjsRequire("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/types/src/pdf");

// Em Node o PDF.js carrega o worker por `eval("require")(workerSrc)`, que o
// rastreador de arquivos da Vercel não enxerga ("Setting up fake worker
// failed: Cannot find module './pdf.worker.js'", produção 07/11/2026). Ele
// consulta `globalThis.pdfjsWorker` antes — entregar o módulo aqui.
const globalWithWorker = globalThis as { pdfjsWorker?: unknown };
if (!globalWithWorker.pdfjsWorker) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  globalWithWorker.pdfjsWorker = pdfjsRequire("pdfjs-dist/legacy/build/pdf.worker.js");
}

export const { getDocument, OPS } = pdfjsLegacy;

/** Pasta do pdfjs-dist subindo `node_modules` a partir do diretório real de execução. */
function findPdfjsDistRoot(): string {
  let moduleDir: string | undefined;
  try {
    moduleDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    moduleDir = undefined;
  }
  for (const origin of [process.env.LAMBDA_TASK_ROOT, process.cwd(), moduleDir]) {
    if (!origin) continue;
    let dir = origin;
    for (let i = 0; i < 12; i += 1) {
      for (const candidate of [
        join(dir, "node_modules", "pdfjs-dist"),
        join(dir, "apps", "sistema", "node_modules", "pdfjs-dist"),
      ]) {
        if (existsSync(join(candidate, "package.json"))) return candidate;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return "";
}

export const pdfjsRoot = findPdfjsDistRoot();
// Fontes padrão e cmaps são opcionais: sem a pasta, PDFs com fontes
// incorporadas (o caso das edições) continuam legíveis.
export const standardFontDataUrl =
  pdfjsRoot && existsSync(join(pdfjsRoot, "standard_fonts")) ? join(pdfjsRoot, "standard_fonts") + "/" : undefined;
export const cMapUrl = pdfjsRoot && existsSync(join(pdfjsRoot, "cmaps")) ? join(pdfjsRoot, "cmaps") + "/" : undefined;
