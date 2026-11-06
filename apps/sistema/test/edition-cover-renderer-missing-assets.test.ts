import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Cenário real pedido pelo proprietário (05/11/2026): a função serverless
 * da Vercel pode não empacotar `standard_fonts`/`cmaps` (recursos
 * OPCIONAIS do pdfjs-dist) junto com o restante do pacote — ver histórico
 * completo em `editionCoverRenderer.ts` e no teste irmão
 * `edition-cover-renderer-init.test.ts`.
 *
 * Este teste roda em arquivo PRÓPRIO (o executor de testes do Node isola
 * o cache de módulos por arquivo) para garantir uma primeira chamada
 * "fria" a `loadPdfjsAssets()` — se rodasse no mesmo processo que outro
 * teste já bem-sucedido, o resultado ficaria em cache e este teste não
 * exercitaria nada de verdade.
 *
 * Sem tocar no `node_modules/pdfjs-dist` real (efeito colateral
 * compartilhado e arriscado): criamos uma pasta falsa com só um
 * `package.json` (sem `standard_fonts`/`cmaps`) e apontamos
 * `LAMBDA_TASK_ROOT` para ela — `findPdfjsDistRoot()` tenta essa variável
 * primeiro, exatamente como faria na função real da Vercel. A importação
 * real de `pdfjs-dist/legacy/build/pdf.js` continua resolvendo pelo
 * `node_modules` de verdade (não afetada por `LAMBDA_TASK_ROOT`), só o
 * cálculo de `standardFontDataUrl`/`cMapUrl` é afetado.
 */
test("renderEditionCoverWebp() não lança erro quando standard_fonts/cmaps não existem no diretório encontrado — usa fontes incorporadas no PDF", async () => {
  const fakeRoot = join(tmpdir(), `ir-pdfjs-missing-assets-${Date.now()}`);
  const fakePdfjsDist = join(fakeRoot, "node_modules", "pdfjs-dist");
  mkdirSync(fakePdfjsDist, { recursive: true });
  writeFileSync(join(fakePdfjsDist, "package.json"), JSON.stringify({ name: "pdfjs-dist", version: "0.0.0-fake" }));

  const previousLambdaTaskRoot = process.env.LAMBDA_TASK_ROOT;
  process.env.LAMBDA_TASK_ROOT = fakeRoot;

  try {
    const { renderEditionCoverWebp } = await import(
      `../src/providers/r2/editionCoverRenderer.ts?missing-assets-${Date.now()}`
    );
    const result = await renderEditionCoverWebp(buildMinimalOnePagePdf(), { targetWidth: 100 });

    assert.ok(result.webpBuffer.length > 0, "mesmo sem standard_fonts/cmaps, a capa não pode sair vazia");
    assert.equal(result.webpBuffer.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(result.webpBuffer.subarray(8, 12).toString("ascii"), "WEBP");
  } finally {
    if (previousLambdaTaskRoot === undefined) delete process.env.LAMBDA_TASK_ROOT;
    else process.env.LAMBDA_TASK_ROOT = previousLambdaTaskRoot;
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

/** Mesmo PDF mínimo usado em edition-cover-renderer-init.test.ts. */
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
