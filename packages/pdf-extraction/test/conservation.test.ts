import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConservation } from "../src/conservation";
import { extractPdf } from "../src/pipeline";
import type { PageExtraction, Paragraph } from "../src/types";
import { buildSingleColumnFixture } from "./fixtures";

function paragraph(overrides: Partial<Paragraph> & Pick<Paragraph, "id" | "column" | "text">): Paragraph {
  return {
    x: 0,
    width: 100,
    yTop: 0,
    yBottom: 0,
    fontSize: 10,
    ...overrides,
  };
}

test("caminho feliz: pipeline real não perde, duplica, altera nem reordena nada", async () => {
  const fixture = await buildSingleColumnFixture();
  const result = await extractPdf(fixture.bytes);
  const report = checkConservation(result.pages[0]);

  assert.equal(report.blocksFound, report.blocksUsed, "todo bloco encontrado foi usado em algum candidato");
  assert.deepEqual(report.orphanBlocks, [], "nenhum bloco órfão");
  assert.deepEqual(report.duplicatedBlocks, [], "nenhum bloco duplicado");
  assert.deepEqual(report.alteredBlocks, [], "nenhum bloco com texto alterado");
  assert.deepEqual(report.reorderedBlockIds, [], "nenhum bloco fora de ordem");
  assert.equal(report.coverageByCount, 1, "cobertura por contagem é 100%");
  assert.equal(report.coverageByChars, 1, "cobertura por caracteres é 100%");
  assert.deepEqual(report.warnings, [], "sem avisos de conservação quando está tudo certo");
});

test("detecta bloco órfão (parágrafo detectado mas não usado em nenhum candidato)", () => {
  const p1 = paragraph({ id: "c0-p0", column: 0, text: "Usado no candidato." });
  const p2 = paragraph({ id: "c0-p1", column: 0, text: "Nunca aparece em nenhum bloco.", yTop: 20, yBottom: 20 });

  const page: PageExtraction = {
    pageNumber: 1,
    pageWidth: 600,
    pageHeight: 800,
    method: "textLayer",
    columnRanges: [[0, 600]],
    paragraphs: [p1, p2],
    articleGroups: [
      {
        column: 0,
        blocks: [{ paragraphId: p1.id, role: "body", text: p1.text, x: 0, y: 0, width: 100, fontSize: 10 }],
        lowConfidenceTitle: true,
        possibleContinuation: false,
        possibleAdvertisement: false,
      },
    ],
    imageCount: 0,
    warnings: [],
  };

  const report = checkConservation(page);
  assert.equal(report.blocksFound, 2);
  assert.equal(report.blocksUsed, 1);
  assert.deepEqual(report.orphanBlocks.map((p) => p.id), ["c0-p1"]);
  assert.ok(report.coverageByCount < 1, "cobertura por contagem cai abaixo de 100%");
  assert.ok(report.coverageByChars < 1, "cobertura por caracteres cai abaixo de 100%");
  assert.ok(report.warnings.some((w) => w.includes("não aparecem em nenhum candidato")));
});

test("detecta bloco usado em mais de um candidato (duplicação)", () => {
  const p1 = paragraph({ id: "c0-p0", column: 0, text: "Texto duplicado por engano." });

  const page: PageExtraction = {
    pageNumber: 1,
    pageWidth: 600,
    pageHeight: 800,
    method: "textLayer",
    columnRanges: [[0, 600]],
    paragraphs: [p1],
    articleGroups: [
      {
        column: 0,
        blocks: [{ paragraphId: p1.id, role: "body", text: p1.text, x: 0, y: 0, width: 100, fontSize: 10 }],
        lowConfidenceTitle: true,
        possibleContinuation: false,
        possibleAdvertisement: false,
      },
      {
        column: 0,
        blocks: [{ paragraphId: p1.id, role: "body", text: p1.text, x: 0, y: 0, width: 100, fontSize: 10 }],
        lowConfidenceTitle: true,
        possibleContinuation: false,
        possibleAdvertisement: false,
      },
    ],
    imageCount: 0,
    warnings: [],
  };

  const report = checkConservation(page);
  assert.equal(report.duplicatedBlocks.length, 1);
  assert.equal(report.duplicatedBlocks[0].paragraphId, "c0-p0");
  assert.equal(report.duplicatedBlocks[0].usageCount, 2);
  assert.ok(report.warnings.some((w) => w.includes("mais de um candidato")));
});

test("detecta bloco com texto alterado em relação ao parágrafo de origem", () => {
  const p1 = paragraph({ id: "c0-p0", column: 0, text: "Texto original exato." });

  const page: PageExtraction = {
    pageNumber: 1,
    pageWidth: 600,
    pageHeight: 800,
    method: "textLayer",
    columnRanges: [[0, 600]],
    paragraphs: [p1],
    articleGroups: [
      {
        column: 0,
        // Bloco com texto diferente do parágrafo de origem — nunca deveria acontecer no pipeline real.
        blocks: [{ paragraphId: p1.id, role: "body", text: "Texto alterado por engano.", x: 0, y: 0, width: 100, fontSize: 10 }],
        lowConfidenceTitle: true,
        possibleContinuation: false,
        possibleAdvertisement: false,
      },
    ],
    imageCount: 0,
    warnings: [],
  };

  const report = checkConservation(page);
  assert.equal(report.alteredBlocks.length, 1);
  assert.equal(report.alteredBlocks[0].expected, "Texto original exato.");
  assert.equal(report.alteredBlocks[0].actual, "Texto alterado por engano.");
  assert.ok(report.warnings.some((w) => w.includes("texto diferente do texto de origem")));
});

test("detecta blocos fora da ordem de leitura dentro do mesmo candidato", () => {
  const p1 = paragraph({ id: "c0-p0", column: 0, text: "Primeiro parágrafo (mais alto na página).", yTop: 10, yBottom: 10 });
  const p2 = paragraph({ id: "c0-p1", column: 0, text: "Segundo parágrafo (mais baixo na página).", yTop: 40, yBottom: 40 });

  const page: PageExtraction = {
    pageNumber: 1,
    pageWidth: 600,
    pageHeight: 800,
    method: "textLayer",
    columnRanges: [[0, 600]],
    paragraphs: [p1, p2],
    articleGroups: [
      {
        column: 0,
        // Ordem invertida: o bloco de p2 (mais baixo) aparece antes do de p1 (mais alto).
        blocks: [
          { paragraphId: p2.id, role: "body", text: p2.text, x: 0, y: 40, width: 100, fontSize: 10 },
          { paragraphId: p1.id, role: "body", text: p1.text, x: 0, y: 10, width: 100, fontSize: 10 },
        ],
        lowConfidenceTitle: true,
        possibleContinuation: false,
        possibleAdvertisement: false,
      },
    ],
    imageCount: 0,
    warnings: [],
  };

  const report = checkConservation(page);
  assert.deepEqual(report.reorderedBlockIds, ["c0-p0"]);
  assert.ok(report.warnings.some((w) => w.includes("fora da ordem de leitura")));
});
