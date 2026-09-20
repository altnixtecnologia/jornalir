import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdf } from "../src/pipeline";
import type { ArticleGroup } from "../src/types";
import {
  buildAccentedCharactersFixture,
  buildAdvertisementNearbyFixture,
  buildContinuationAcrossColumnsFixture,
  buildSingleColumnFixture,
  buildTitleSubtitleBodyFixture,
  buildTwoColumnFixture,
} from "./fixtures";

function textOf(group: ArticleGroup, role: "title" | "subtitle" | "body"): string | undefined {
  const blocks = group.blocks.filter((block) => block.role === role);
  if (blocks.length === 0) return undefined;
  return blocks.map((block) => block.text).join("\n");
}

function bodyParagraphs(group: ArticleGroup): string[] {
  return group.blocks.filter((block) => block.role === "body").map((block) => block.text);
}

test("uma coluna: título e corpo (dois parágrafos) são extraídos com correspondência exata", async () => {
  const fixture = await buildSingleColumnFixture();
  const result = await extractPdf(fixture.bytes);

  assert.equal(result.pageCount, 1);
  const page = result.pages[0];
  assert.equal(page.method, "textLayer");
  assert.equal(page.columnSegments.length, 1, "página de uma coluna deve detectar exatamente uma coluna");
  assert.equal(page.articleGroups.length, 1, "deve haver exatamente uma matéria candidata");

  const [group] = page.articleGroups;
  assert.equal(textOf(group, "title"), fixture.expected.title);
  assert.deepEqual(bodyParagraphs(group), fixture.expected.bodyParagraphs);
  assert.equal(group.lowConfidenceTitle, false);

  // Imagem não bloqueia a criação do candidato e é contabilizada na página.
  assert.equal(page.imageCount, 1);
});

test("duas colunas: cada matéria permanece na sua própria coluna, sem mistura", async () => {
  const fixture = await buildTwoColumnFixture();
  const result = await extractPdf(fixture.bytes);
  const page = result.pages[0];

  assert.equal(page.columnSegments.length, 2, "deve detectar exatamente duas colunas");
  assert.equal(page.articleGroups.length, 2, "cada coluna deve gerar sua própria matéria");

  const [groupLeft] = page.articleGroups.filter((g) => g.column === 0);
  const [groupRight] = page.articleGroups.filter((g) => g.column === 1);

  assert.equal(textOf(groupLeft, "title"), fixture.columnOne.title);
  assert.deepEqual(bodyParagraphs(groupLeft), fixture.columnOne.bodyParagraphs);

  assert.equal(textOf(groupRight, "title"), fixture.columnTwo.title);
  assert.deepEqual(bodyParagraphs(groupRight), fixture.columnTwo.bodyParagraphs);

  // Nenhum texto de uma coluna aparece na matéria da outra.
  const leftFullText = [textOf(groupLeft, "title"), ...bodyParagraphs(groupLeft)].join(" ");
  const rightFullText = [textOf(groupRight, "title"), ...bodyParagraphs(groupRight)].join(" ");
  assert.ok(!leftFullText.includes("artesanato"));
  assert.ok(!rightFullText.includes("amistoso"));
});

test("título + subtítulo + corpo são classificados corretamente por tamanho de fonte", async () => {
  const fixture = await buildTitleSubtitleBodyFixture();
  const result = await extractPdf(fixture.bytes);
  const [group] = result.pages[0].articleGroups;

  assert.equal(textOf(group, "title"), fixture.expected.title);
  assert.equal(textOf(group, "subtitle"), fixture.expected.subtitle);
  assert.deepEqual(bodyParagraphs(group), fixture.expected.bodyParagraphs);
  assert.equal(group.lowConfidenceTitle, false);
});

test("caracteres acentuados são preservados exatamente, inclusive em linha fragmentada em dois itens", async () => {
  const fixture = await buildAccentedCharactersFixture();
  const result = await extractPdf(fixture.bytes);
  const [group] = result.pages[0].articleGroups;

  assert.equal(textOf(group, "title"), fixture.expected.title);
  assert.deepEqual(bodyParagraphs(group), fixture.expected.bodyParagraphs);

  // Nenhum aviso de caractere suspeito para texto acentuado legítimo.
  const page = result.pages[0];
  const suspiciousWarnings = page.warnings.filter((w) => w.includes("caractere"));
  assert.deepEqual(suspiciousWarnings, []);
});

test("página com bloco isolado (possível anúncio) não mistura o texto dele com as matérias vizinhas", async () => {
  const fixture = await buildAdvertisementNearbyFixture();
  const result = await extractPdf(fixture.bytes);
  const page = result.pages[0];

  assert.equal(page.articleGroups.length, 3, "matéria A, bloco isolado e matéria B devem ser três grupos distintos");

  const groupA = page.articleGroups[0];
  const adGroup = page.articleGroups[1];
  const groupB = page.articleGroups[2];

  assert.equal(textOf(groupA, "title"), fixture.expected.articleA.title);
  assert.deepEqual(bodyParagraphs(groupA), fixture.expected.articleA.bodyParagraphs);
  assert.equal(textOf(groupB, "title"), fixture.expected.articleB.title);
  assert.deepEqual(bodyParagraphs(groupB), fixture.expected.articleB.bodyParagraphs);

  // O texto do bloco isolado não aparece dentro das matérias vizinhas.
  assert.ok(!bodyParagraphs(groupA).join(" ").includes("Liquidação"));
  assert.ok(!bodyParagraphs(groupB).join(" ").includes("Liquidação"));

  // O bloco isolado é sinalizado, não descartado automaticamente.
  assert.deepEqual(bodyParagraphs(adGroup), [fixture.expected.adText]);
  assert.equal(adGroup.possibleAdvertisement, true);
  assert.ok(page.warnings.some((w) => w.includes("possível publicidade")));
});

test("matéria continuando em outra coluna: nenhum texto é perdido, misturado ou fundido automaticamente", async () => {
  const fixture = await buildContinuationAcrossColumnsFixture();
  const result = await extractPdf(fixture.bytes);
  const page = result.pages[0];

  assert.equal(page.articleGroups.length, 2, "coluna 1 e coluna 2 permanecem como candidatos separados");

  const [groupLeft] = page.articleGroups.filter((g) => g.column === 0);
  const [groupRight] = page.articleGroups.filter((g) => g.column === 1);

  assert.deepEqual(bodyParagraphs(groupLeft), [fixture.expected.columnOneText]);
  assert.deepEqual(bodyParagraphs(groupRight), [fixture.expected.columnTwoText]);

  // A coluna 1 termina sem pontuação de fechamento: deve ser sinalizada como
  // possível continuação, para o revisor decidir mesclar (Fase 08), nunca
  // uma fusão automática e silenciosa.
  assert.equal(groupLeft.possibleContinuation, true);
  assert.ok(page.warnings.some((w) => w.includes("possível continuação")));

  // A junção completa (coluna 1 + coluna 2) reconstitui a frase original
  // exatamente, mostrando que nada foi perdido nem duplicado na fronteira.
  const combined = `${fixture.expected.columnOneText} ${fixture.expected.columnTwoText}`;
  assert.equal(
    combined,
    "O programa passa a atender mais oito bairros a partir do próximo mês, segundo a secretaria de meio ambiente, que destacou que a iniciativa deve beneficiar cerca de duzentas famílias na região nos próximos seis meses.",
  );
});
