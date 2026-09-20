import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConservation } from "../src/conservation";
import { extractPdf } from "../src/pipeline";
import { buildMixedLayoutFixture } from "./fixtures";

/**
 * Fase 11 — reproduz e prova a correção do Achado 2 da Fase 10
 * (`docs/PDF-REAL-VALIDATION.md`): diagramação mista, matéria larga no topo
 * e na base da página com uma faixa intermediária de duas colunas lado a
 * lado (larga + estreita). Antes desta fase, a detecção de colunas olhava
 * só para a página inteira e nunca via o vão entre as duas colunas da faixa
 * do meio — o texto de assuntos diferentes acabava misturado na mesma
 * "linha" lógica.
 */
test("diagramação mista: a página tem mais de uma região vertical com estrutura de colunas própria", async () => {
  const fixture = await buildMixedLayoutFixture();
  const result = await extractPdf(fixture.bytes);
  const page = result.pages[0];

  const distinctBands = new Set(page.columnSegments.map((segment) => `${segment.yTop}-${segment.yBottom}`));
  assert.ok(
    distinctBands.size >= 2,
    `esperava pelo menos 2 regiões verticais distintas (topo/base de 1 coluna, meio de 2 colunas); encontrou ${distinctBands.size}`,
  );

  const maxColumnsInAnyRegion = Math.max(
    ...[...distinctBands].map(
      (key) => page.columnSegments.filter((segment) => `${segment.yTop}-${segment.yBottom}` === key).length,
    ),
  );
  assert.ok(maxColumnsInAnyRegion >= 2, "a faixa intermediária deve ter pelo menos 2 colunas detectadas");
});

test("diagramação mista: nenhum candidato mistura texto da matéria larga com o da coluna estreita", async () => {
  const fixture = await buildMixedLayoutFixture();
  const { wideMarker, narrowLeftMarker, narrowRightMarker } = fixture.expected;
  const result = await extractPdf(fixture.bytes);
  const page = result.pages[0];

  const markers = [wideMarker, narrowLeftMarker, narrowRightMarker];
  for (const group of page.articleGroups) {
    const groupText = group.blocks.map((block) => block.text).join(" ");
    const markersPresent = markers.filter((marker) => groupText.includes(marker));
    assert.ok(
      markersPresent.length <= 1,
      `candidato da coluna ${group.column} mistura marcadores de assuntos diferentes: ${markersPresent.join(", ")} — texto: "${groupText.slice(0, 200)}"`,
    );
  }

  // Nenhum marcador foi perdido: os três aparecem em algum candidato.
  const allText = page.articleGroups.flatMap((g) => g.blocks.map((b) => b.text)).join(" ");
  for (const marker of markers) {
    assert.ok(allText.includes(marker), `marcador "${marker}" não apareceu em nenhum candidato (possível perda de texto)`);
  }
});

test("diagramação mista: conservação textual continua em 100% (zero perda, duplicação, alteração ou fora de ordem)", async () => {
  const fixture = await buildMixedLayoutFixture();
  const result = await extractPdf(fixture.bytes);
  const report = checkConservation(result.pages[0]);

  assert.deepEqual(report.orphanBlocks, [], "nenhum bloco órfão");
  assert.deepEqual(report.duplicatedBlocks, [], "nenhum bloco duplicado");
  assert.deepEqual(report.alteredBlocks, [], "nenhum bloco com texto alterado");
  assert.deepEqual(report.reorderedBlockIds, [], "nenhum bloco fora de ordem");
  assert.equal(report.coverageByCount, 1, "cobertura por contagem é 100%");
  assert.equal(report.coverageByChars, 1, "cobertura por caracteres é 100%");
});

test("layout uniforme continua com uma única região (nenhuma fragmentação artificial)", async () => {
  const { buildSingleColumnFixture } = await import("./fixtures");
  const fixture = await buildSingleColumnFixture();
  const result = await extractPdf(fixture.bytes);
  const page = result.pages[0];

  const distinctBands = new Set(page.columnSegments.map((segment) => `${segment.yTop}-${segment.yBottom}`));
  assert.equal(distinctBands.size, 1, "página de coluna única e estrutura uniforme não deve ser fragmentada em regiões");
});
