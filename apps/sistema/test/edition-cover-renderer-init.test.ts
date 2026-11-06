import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname as pathDirname, resolve } from "node:path";
import { renderEditionCoverWebp } from "../src/providers/r2/editionCoverRenderer";

const __dirname = pathDirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(__dirname, "../src/providers/r2/editionCoverRenderer.ts"), "utf8");

/**
 * Três tentativas baseadas em `require.resolve()` (direto, renomeado, e
 * isolado numa `Function` opaca recebendo o require já criado como
 * argumento) falharam em produção na Vercel (projeto jornalir-sistema),
 * todas com `TypeError [ERR_INVALID_ARG_TYPE] ... Received type number`
 * em `dirname()` (digests 2211172284 e 2130500082) — comprovado
 * reconstruindo o bundle de produção repetidas vezes: QUALQUER referência
 * ao valor devolvido por `createRequire(...)` que não seja chamá-lo direto
 * com uma string literal é reescrita pelo webpack (vira um ID numérico ou
 * um módulo-stub `Cannot find module`), não importa o nome da variável
 * nem quantas camadas de indireção.
 *
 * A correção real abandona `require.resolve()` por completo: localiza
 * `node_modules/pdfjs-dist` subindo diretórios a partir de
 * `import.meta.url` (uma string — o webpack a substitui pelo caminho real
 * do arquivo em texto puro, sem nenhuma reescrita especial) usando só
 * `node:fs`/`node:path`, o mesmo algoritmo que o Node usa para resolver
 * módulos, escrito à mão, sem tocar em `require`. Este teste tem duas
 * partes: (1) checagem estática que bloqueia os padrões vulneráveis e
 * garante o padrão corrigido (`findPdfjsDistRoot`); (2) uma chamada REAL a
 * `renderEditionCoverWebp`, que força a avaliação da resolução lazy
 * (inclusive a função corrigida) e exercita o pipeline de renderização de
 * verdade (pdfjs-dist + @napi-rs/canvas + sharp).
 */
test("editionCoverRenderer.ts localiza o pdfjs-dist subindo node_modules a partir de import.meta.url, nunca via require.resolve()", () => {
  assert.doesNotMatch(
    SOURCE,
    /\.resolve\(\s*"pdfjs-dist/,
    "qualquer .resolve(\"pdfjs-dist...\") — direto, renomeado ou dentro de uma Function opaca — é reescrito pelo webpack para um ID numérico ou um módulo-stub, não importa a indireção",
  );
  assert.doesNotMatch(
    SOURCE,
    /:\s*require\b/,
    "uma referência nua a uma variável chamada require (ex.: em fallback de ternário) é substituída por um módulo-stub pelo webpack",
  );
  assert.doesNotMatch(SOURCE, /new Function\(/, "a indireção via Function construída em runtime não escapa o bug — o require passado a ela já vem quebrado");
  assert.match(SOURCE, /function findPdfjsDistRoot\(\): string/);
  assert.match(SOURCE, /join\(dir, "node_modules", "pdfjs-dist"\)/);
  assert.match(SOURCE, /existsSync\(candidate\)/);
});

test("renderEditionCoverWebp() carrega o módulo de verdade (sem mock) e renderiza uma capa real a partir de um PDF mínimo válido", async () => {
  const minimalPdf = buildMinimalOnePagePdf();
  const result = await renderEditionCoverWebp(minimalPdf, { targetWidth: 100 });

  assert.ok(result.webpBuffer.length > 0, "a capa gerada não pode estar vazia");
  // Assinatura RIFF/WEBP: "RIFF"...."WEBP".
  assert.equal(result.webpBuffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(result.webpBuffer.subarray(8, 12).toString("ascii"), "WEBP");
  assert.ok(result.widthPx > 0 && result.heightPx > 0);
});

/** PDF mínimo válido de 1 página em branco (200x200pt) — texto puro, sem
 * conteúdo/fontes, suficiente para exercitar getDocument()/getPage()/
 * render() de ponta a ponta. */
function buildMinimalOnePagePdf(): Uint8Array {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
trailer
<< /Size 5 /Root 1 0 R >>
%%EOF
`;
  return new TextEncoder().encode(pdf);
}
