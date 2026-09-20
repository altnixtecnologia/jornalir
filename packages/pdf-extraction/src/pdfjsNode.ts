import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// `require` explícito (não `import` ESM) é deliberado: pdfjs-dist/legacy é
// CommonJS, e o interop padrão do Node para "default export" de um módulo
// CJS varia conforme o "type" do package.json mais próximo de quem importa
// (apps/sistema não declara "type": "module"; este pacote declara). Usar
// `require` sempre retorna o mesmo `module.exports`, independente de quem
// chama — evita quebra silenciosa da desestruturação de `OPS`/`getDocument`.
const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLegacy = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/types/src/pdf");

export const { getDocument, OPS } = pdfjsLegacy;

export const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
export const standardFontDataUrl = join(pdfjsRoot, "standard_fonts") + "/";
export const cMapUrl = join(pdfjsRoot, "cmaps") + "/";
