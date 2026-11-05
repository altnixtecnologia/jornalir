import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname as pathDirname, resolve } from "node:path";
import { renderEditionCoverWebp } from "../src/providers/r2/editionCoverRenderer";

const __dirname = pathDirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(__dirname, "../src/providers/r2/editionCoverRenderer.ts"), "utf8");

/**
 * Bug real de produção (05/11/2026): `require.resolve("pdfjs-dist/package.json")`
 * sob o bundle webpack do Next.js na Vercel NUNCA devolve um caminho de
 * arquivo — webpack reescreve a chamada estaticamente para devolver o ID
 * numérico do módulo no bundle (confirmado nos logs reais:
 * `TypeError [ERR_INVALID_ARG_TYPE]: ... Received type number (43899)`,
 * ao reaproveitar o PDF da edição 776 pelo painel). `dirname()` nesse
 * número quebra a Server Action antes de qualquer renderização.
 *
 * Este teste tem duas partes: (1) uma checagem estática que garante que o
 * padrão vulnerável nunca volta a aparecer e que o padrão corrigido
 * (`__non_webpack_require__` com fallback) está presente — é a parte que
 * detecta uma regressão de código; (2) uma chamada REAL a
 * `renderEditionCoverWebp`, que força a avaliação de todo o topo do módulo
 * (inclusive a linha corrigida) e exercita o pipeline de renderização de
 * verdade (pdfjs-dist + @napi-rs/canvas + sharp), fora do ambiente webpack —
 * aqui `__non_webpack_require__` não existe, e o fallback precisa continuar
 * funcionando igual a antes da correção.
 */
test("editionCoverRenderer.ts nunca volta a usar require.resolve() direto para localizar o pdfjs-dist — sempre via __non_webpack_require__ com fallback", () => {
  assert.doesNotMatch(
    SOURCE,
    /dirname\(require\.resolve\(/,
    "require.resolve() direto quebra em produção sob o bundle webpack da Vercel (devolve um ID numérico, não um caminho)",
  );
  assert.match(SOURCE, /typeof __non_webpack_require__ !== "undefined" \? __non_webpack_require__ : require/);
  assert.match(SOURCE, /dirname\(realRequire\.resolve\(/);
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
