import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clamp01,
  filterItemsInRegion,
  normalizedRectToPoints,
  overlapRatio,
  rectFromPoints,
  selectionColor,
} from "../src/features/editorial/visualCaptureRegion";
import type { TextItem } from "@ir/pdf-extraction";

function item(x: number, yBaseline: number, width: number, fontSize: number): TextItem {
  return { text: "x", x, yBaseline, width, fontSize, fontName: "f", hasEOL: false };
}

test("clamp01 limita ao intervalo 0..1", () => {
  assert.equal(clamp01(-0.4), 0);
  assert.equal(clamp01(1.4), 1);
  assert.equal(clamp01(0.4), 0.4);
});

test("rectFromPoints: ordena os pontos e recorta em 0..1, independente da ordem do arrasto", () => {
  assert.deepEqual(rectFromPoints({ x: 0.5, y: 0.7 }, { x: 0.1, y: 0.1 }), { x: 0.1, y: 0.1, width: 0.4, height: 0.6 });
  assert.deepEqual(rectFromPoints({ x: -1, y: -1 }, { x: 2, y: 2 }), { x: 0, y: 0, width: 1, height: 1 });
});

test("overlapRatio: 1 para retângulos idênticos, 0 para disjuntos", () => {
  const rect = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 };
  assert.equal(overlapRatio(rect, rect), 1);
  assert.equal(overlapRatio(rect, { x: 0.8, y: 0.8, width: 0.1, height: 0.1 }), 0);
});

test("normalizedRectToPoints: converte para o espaço de pontos da página", () => {
  assert.deepEqual(normalizedRectToPoints({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 800, 1000), {
    x: 80, y: 200, width: 240, height: 400,
  });
});

test("filterItemsInRegion: só itens cujo centro cai dentro do retângulo entram, nada de fora é misturado", () => {
  const inside = item(100, 220, 60, 12); // centro ≈ (130, 215.8)
  const outsideLeft = item(10, 220, 20, 12);
  const outsideBelow = item(100, 900, 60, 12);
  const result = filterItemsInRegion([inside, outsideLeft, outsideBelow], { x: 90, y: 180, width: 100, height: 100 });
  assert.deepEqual(result, [inside]);
});

test("filterItemsInRegion: região vazia não retorna nada", () => {
  assert.deepEqual(filterItemsInRegion([item(500, 500, 10, 10)], { x: 0, y: 0, width: 10, height: 10 }), []);
});

test("selectionColor: cores reproduzíveis e cíclicas após 8", () => {
  assert.equal(selectionColor(0), selectionColor(8));
  assert.notEqual(selectionColor(0), selectionColor(1));
});
