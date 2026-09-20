import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdf } from "../src/pipeline";
import type { OcrProvider } from "../src/types";
import { buildNoTextLayerFixture, buildSingleColumnFixture } from "./fixtures";

test("página sem camada de texto: sem OCR disponível, o pipeline não inventa texto e sinaliza claramente", async () => {
  const fixture = await buildNoTextLayerFixture();
  const result = await extractPdf(fixture.bytes);
  const page = result.pages[0];

  assert.equal(page.method, "unavailable");
  assert.deepEqual(page.articleGroups, []);
  assert.ok(page.warnings.some((w) => w.includes("não tem camada de texto")));
  assert.ok(page.warnings.some((w) => w.includes("OCR")));
});

test("página sem camada de texto: com um provedor de OCR disponível, o resultado é usado mas claramente marcado como não-exato", async () => {
  const fixture = await buildNoTextLayerFixture();
  const fakeOcrProvider: OcrProvider = {
    name: "fake-ocr-for-test",
    async isAvailable() {
      return true;
    },
    async recognizePage() {
      return { text: "Texto reconhecido por OCR de teste.", confidence: 0.42 };
    },
  };

  const result = await extractPdf(fixture.bytes, { ocrProvider: fakeOcrProvider });
  const page = result.pages[0];

  assert.equal(page.method, "ocr");
  assert.equal(page.articleGroups.length, 1);
  assert.equal(page.articleGroups[0].blocks[0].text, "Texto reconhecido por OCR de teste.");
  assert.equal(page.articleGroups[0].lowConfidenceTitle, true);
  assert.ok(page.warnings.some((w) => w.includes("OCR") && w.includes("42%")));
});

test("página com camada de texto nunca aciona OCR", async () => {
  const fixture = await buildSingleColumnFixture();
  let called = false;
  const spyProvider: OcrProvider = {
    name: "spy",
    async isAvailable() {
      called = true;
      return true;
    },
    async recognizePage() {
      called = true;
      return { text: "não deveria ser usado", confidence: 1 };
    },
  };

  const result = await extractPdf(fixture.bytes, { ocrProvider: spyProvider });
  assert.equal(result.pages[0].method, "textLayer");
  assert.equal(called, false, "OCR não deve ser chamado quando já existe camada de texto");
});

test("contagem de páginas e estrutura geral do resultado", async () => {
  const fixture = await buildSingleColumnFixture();
  const result = await extractPdf(fixture.bytes);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].pageNumber, 1);
  assert.ok(result.pages[0].pageWidth > 0);
  assert.ok(result.pages[0].pageHeight > 0);
});
