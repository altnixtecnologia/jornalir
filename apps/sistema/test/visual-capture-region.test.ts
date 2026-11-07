import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clamp01,
  computeResizedRect,
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

// ---------------------------------------------------------------------------
// computeResizedRect — ajustar uma seleção já desenhada (revisão de
// 07/11/2026, item 3): mover pelo corpo e redimensionar pelos 4 cantos,
// sem deixar o retângulo sair de 0..1 nem ficar menor que o mínimo.
// ---------------------------------------------------------------------------

const BASE_RECT = { x: 0.3, y: 0.3, width: 0.2, height: 0.15 };

/** Compara com tolerância de ponto flutuante (aritmética de soma/subtração de passos de 0.05-0.1 não bate byte a byte). */
function assertRectClose(actual: { x: number; y: number; width: number; height: number }, expected: { x: number; y: number; width: number; height: number }): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: esperado ${expected[key]}, obtido ${actual[key]}`);
  }
}

test("computeResizedRect: 'move' desloca o retângulo inteiro, mantendo o tamanho", () => {
  const result = computeResizedRect(BASE_RECT, "move", 0.1, -0.05);
  assert.deepEqual(result, { x: 0.4, y: 0.25, width: 0.2, height: 0.15 });
});

test("computeResizedRect: 'move' nunca deixa o retângulo sair de 0..1", () => {
  assert.deepEqual(computeResizedRect(BASE_RECT, "move", -10, -10), { x: 0, y: 0, width: 0.2, height: 0.15 });
  assert.deepEqual(computeResizedRect(BASE_RECT, "move", 10, 10), { x: 0.8, y: 0.85, width: 0.2, height: 0.15 });
});

test("computeResizedRect: canto 'se' estica a largura/altura a partir do canto oposto (nw fixo)", () => {
  const result = computeResizedRect(BASE_RECT, "se", 0.1, 0.1);
  assertRectClose(result, { x: 0.3, y: 0.3, width: 0.3, height: 0.25 });
});

test("computeResizedRect: canto 'nw' move o canto superior-esquerdo, mantendo o canto inferior-direito fixo", () => {
  const result = computeResizedRect(BASE_RECT, "nw", -0.1, -0.1);
  assertRectClose(result, { x: 0.2, y: 0.2, width: 0.3, height: 0.25 });
});

test("computeResizedRect: canto 'ne' move o lado direito e o topo, mantendo x e o fundo fixos", () => {
  const result = computeResizedRect(BASE_RECT, "ne", 0.05, -0.05);
  assertRectClose(result, { x: 0.3, y: 0.25, width: 0.25, height: 0.2 });
});

test("computeResizedRect: canto 'sw' move o lado esquerdo e o fundo, mantendo y e a direita fixos", () => {
  const result = computeResizedRect(BASE_RECT, "sw", -0.05, 0.05);
  assertRectClose(result, { x: 0.25, y: 0.3, width: 0.25, height: 0.2 });
});

test("computeResizedRect: nunca fica menor que o tamanho mínimo, mesmo arrastando o canto além do oposto", () => {
  const result = computeResizedRect(BASE_RECT, "se", -10, -10);
  assert.ok(result.width > 0, "largura precisa continuar positiva");
  assert.ok(result.height > 0, "altura precisa continuar positiva");
  assert.ok(result.width < 0.02 && result.height < 0.02, "deve colapsar perto do mínimo, não inverter");
});

test("computeResizedRect: redimensionar nunca deixa o retângulo sair de 0..1", () => {
  const result = computeResizedRect(BASE_RECT, "se", 10, 10);
  assert.ok(result.x + result.width <= 1.0001);
  assert.ok(result.y + result.height <= 1.0001);
});
