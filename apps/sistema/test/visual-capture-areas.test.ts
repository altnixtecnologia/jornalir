import { test } from "node:test";
import assert from "node:assert/strict";
import { combineAreaExtractions } from "../src/features/editorial/visualCaptureAreas";
import type { RegionArticleExtraction } from "@ir/pdf-extraction";

function extraction(overrides: Partial<RegionArticleExtraction> = {}): RegionArticleExtraction {
  return { title: "", subtitle: "", bodyParagraphs: [], needsReview: false, warnings: [], ...overrides };
}

test("uma única área: repassa título/subtítulo/corpo sem alterar", () => {
  const result = combineAreaExtractions(
    [extraction({ title: "TÍTULO", subtitle: "Sub", bodyParagraphs: ["Parágrafo um."] })],
    ["Página 7"],
  );
  assert.equal(result.title, "TÍTULO");
  assert.equal(result.subtitle, "Sub");
  assert.deepEqual(result.bodyParagraphs, ["Parágrafo um."]);
  assert.equal(result.needsReview, false);
  assert.deepEqual(result.warnings, []);
});

test("duas áreas (continuação noutra página): corpo da segunda entra depois, na ordem escolhida", () => {
  const result = combineAreaExtractions(
    [
      extraction({ title: "TÍTULO", bodyParagraphs: ["Primeira parte."] }),
      extraction({ bodyParagraphs: ["Continuação na página seguinte."] }),
    ],
    ["Página 7", "Página 9"],
  );
  assert.equal(result.title, "TÍTULO");
  assert.deepEqual(result.bodyParagraphs, ["Primeira parte.", "Continuação na página seguinte."]);
  assert.equal(result.needsReview, false);
});

test("título reconhecido numa área além da primeira: nunca substitui o título, entra no corpo com aviso", () => {
  const result = combineAreaExtractions(
    [
      extraction({ title: "TÍTULO PRINCIPAL", bodyParagraphs: ["Corpo inicial."] }),
      extraction({ title: "OUTRO TÍTULO", subtitle: "Sub da segunda", bodyParagraphs: ["Corpo da segunda área."] }),
    ],
    ["Página 7", "Página 9"],
  );
  assert.equal(result.title, "TÍTULO PRINCIPAL");
  assert.equal(result.needsReview, true);
  assert.ok(result.warnings.some((w) => w.includes("um título foi reconhecido nesta área além da primeira")));
  // Nada é descartado: título, subtítulo e corpo da segunda área entram no corpo combinado.
  assert.deepEqual(result.bodyParagraphs, ["Corpo inicial.", "OUTRO TÍTULO", "Sub da segunda", "Corpo da segunda área."]);
});

test("avisos de cada área ganham o rótulo da área correspondente", () => {
  const result = combineAreaExtractions(
    [extraction({ title: "T", warnings: ["Mais de um título foi reconhecido nesta seleção."] })],
    ["Página 3"],
  );
  assert.ok(result.warnings[0].startsWith("Página 3:"));
});

test("necessidade de revisão de qualquer área contamina o resultado combinado", () => {
  const result = combineAreaExtractions(
    [extraction({ title: "T" }), extraction({ needsReview: true, bodyParagraphs: ["x"] })],
    ["Página 1", "Página 2"],
  );
  assert.equal(result.needsReview, true);
});

test("nenhuma área selecionada: sinaliza revisão, nunca inventa nada", () => {
  const result = combineAreaExtractions([], []);
  assert.equal(result.title, "");
  assert.equal(result.needsReview, true);
  assert.ok(result.warnings[0].includes("Nenhuma área"));
});
