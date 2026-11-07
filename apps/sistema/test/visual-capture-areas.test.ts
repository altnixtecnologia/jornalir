import { test } from "node:test";
import assert from "node:assert/strict";
import { appendRegionToCapture, combineAreaExtractions } from "../src/features/editorial/visualCaptureAreas";
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


function sampleCapture() {
  const first = extraction({ title: "MATÉRIA TESTE", bodyParagraphs: ["Texto inicial."] });
  return {
    id: "materia-1",
    color: "#2563eb",
    title: "MATÉRIA TESTE",
    subtitle: "Subtítulo editado",
    body: "Texto inicial.",
    areas: [{ page: 2, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.3 } }],
    perAreaExtraction: [first],
    needsReview: false,
    warnings: [] as string[],
  };
}

test("continuar matéria na mesma página: mantém id, cor e título; soma áreas e corpo", () => {
  const original = sampleCapture();
  const next = appendRegionToCapture(
    original,
    { page: 2, rect: { x: 0.5, y: 0.6, width: 0.3, height: 0.2 } },
    extraction({ bodyParagraphs: ["Continuação desta matéria."] }),
  );
  assert.ok(next);
  assert.equal(next.id, original.id);
  assert.equal(next.color, original.color);
  assert.equal(next.title, original.title);
  assert.equal(next.subtitle, original.subtitle);
  assert.equal(next.areas.length, 2);
  assert.equal(next.perAreaExtraction.length, 2);
  assert.equal(next.body, "Texto inicial.\n\nContinuação desta matéria.");
  assert.equal(original.areas.length, 1, "a seleção original não pode ser alterada por mutação");
});

test("continuação em outra página permanece vinculada à mesma matéria", () => {
  const original = sampleCapture();
  const next = appendRegionToCapture(
    original,
    { page: 3, rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 } },
    extraction({ bodyParagraphs: ["Texto da página seguinte."] }),
  );
  assert.ok(next);
  assert.deepEqual(next.areas.map((area) => area.page), [2, 3]);
  assert.match(next.body, /Texto da página seguinte/);
});

test("trecho sem texto nunca gera retângulo vinculado sem conteúdo", () => {
  const original = sampleCapture();
  const next = appendRegionToCapture(original, { page: 3, rect: { x: 0, y: 0, width: 1, height: 1 } }, extraction());
  assert.equal(next, null);
  assert.equal(original.areas.length, 1);
});

test("trecho adicional com título detectado não substitui o título original", () => {
  const next = appendRegionToCapture(
    sampleCapture(),
    { page: 2, rect: { x: 0.4, y: 0.5, width: 0.4, height: 0.2 } },
    extraction({ title: "OUTRO TÍTULO", bodyParagraphs: ["Corpo extra."] }),
  );
  assert.ok(next);
  assert.equal(next.title, "MATÉRIA TESTE");
  assert.match(next.body, /OUTRO TÍTULO/);
  assert.match(next.body, /Corpo extra/);
  assert.equal(next.needsReview, true);
  assert.ok(next.warnings.some((w) => w.includes("título foi reconhecido")));
});

test("múltiplas continuações preservam ordem sem criar outra matéria", () => {
  const a = appendRegionToCapture(
    sampleCapture(),
    { page: 2, rect: { x: 0.5, y: 0.1, width: 0.4, height: 0.2 } },
    extraction({ bodyParagraphs: ["Trecho dois."] }),
  );
  assert.ok(a);
  const b = appendRegionToCapture(
    a,
    { page: 4, rect: { x: 0.2, y: 0.2, width: 0.4, height: 0.2 } },
    extraction({ bodyParagraphs: ["Trecho três."] }),
  );
  assert.ok(b);
  assert.equal(b.id, "materia-1");
  assert.equal(b.areas.length, 3);
  assert.equal(b.body, "Texto inicial.\n\nTrecho dois.\n\nTrecho três.");
});
