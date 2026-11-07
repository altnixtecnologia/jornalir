import { test } from "node:test";
import assert from "node:assert/strict";
import { extractArticleFromRegion } from "../src/newspaper";
import type { TextItem } from "../src/types";

// Itens sintéticos de UMA seleção manual (captura visual) — mesmas convenções
// de fonte/tamanho de `newspaper.test.ts` (Gotham-Black = título, Times =
// corpo), mas sem cabeçalho/colunas de página inteira: a região já é
// exatamente o que o operador arrastou.
const TITLE_FONT = "TLHPSM+Gotham-Black";
const SUBTITLE_FONT = "TDJUSM+Arial-BoldMT";
const BODY_FONT = "INTWUI+TimesNewRomanPSMT";

function item(text: string, x: number, y: number, size: number, font: string, width?: number): TextItem {
  return {
    text,
    x,
    yBaseline: y,
    width: width ?? text.length * size * 0.5,
    fontSize: size,
    fontName: font,
    realFontName: font,
    hasEOL: false,
  };
}

test("região com título, subtítulo e corpo: reconhece os três campos", () => {
  const items: TextItem[] = [
    item("SUPERCOOPER INAUGURA NOVA SEDE", 10, 20, 24, TITLE_FONT, 300),
    item("Loja amplia atendimento na região sul do estado", 10, 40, 13, SUBTITLE_FONT, 280),
    item("A inauguração foi realizada na manhã de ontem, com a presença de", 10, 70, 12, BODY_FONT, 280),
    item("autoridades municipais e representantes do comércio local.", 10, 84, 12, BODY_FONT, 260),
    item("O investimento ampliará os serviços oferecidos aos moradores.", 10, 98, 12, BODY_FONT, 260),
  ];
  const result = extractArticleFromRegion(items, 320, 120);
  assert.equal(result.title, "SUPERCOOPER INAUGURA NOVA SEDE");
  assert.equal(result.subtitle, "Loja amplia atendimento na região sul do estado");
  assert.ok(result.bodyParagraphs.join(" ").includes("O investimento"));
  assert.equal(result.needsReview, false);
  assert.deepEqual(result.warnings, []);
});

test("região sem nenhum item (seleção vazia / só imagem): nada inventado", () => {
  const result = extractArticleFromRegion([], 200, 100);
  assert.equal(result.title, "");
  assert.equal(result.bodyParagraphs.length, 0);
  assert.equal(result.needsReview, true);
  assert.ok(result.warnings[0].includes("Nenhum texto"));
});

test("região só com corpo (continuação de matéria noutra página): sem título, nunca inventa", () => {
  const items: TextItem[] = [
    item("A reunião contou com a presença de todos os representantes locais e", 10, 20, 12, BODY_FONT, 280),
    item("regionais, que discutiram os próximos passos do projeto conjunto.", 10, 34, 12, BODY_FONT, 260),
  ];
  const result = extractArticleFromRegion(items, 300, 60);
  assert.equal(result.title, "");
  assert.ok(result.bodyParagraphs.join(" ").includes("representantes locais"));
  assert.equal(result.needsReview, true);
  assert.ok(result.warnings.some((w) => w.includes("Nenhum título reconhecido")));
});

test("duas matérias na mesma seleção (recorte impreciso): título principal + aviso, nada descartado", () => {
  const items: TextItem[] = [
    item("PREFEITURA ANUNCIA NOVO PROGRAMA", 10, 20, 24, TITLE_FONT, 300),
    item("O programa vai atender famílias de baixa renda em toda a região.", 10, 50, 12, BODY_FONT, 280),
    item("A medida foi anunciada durante evento realizado no auditório municipal.", 10, 64, 12, BODY_FONT, 280),
    item("CÂMARA APROVA PROJETO DE LEI", 10, 160, 24, TITLE_FONT, 300),
    item("O projeto segue agora para sanção do prefeito, segundo informou a assessoria.", 10, 190, 12, BODY_FONT, 280),
    item("A votação ocorreu por unanimidade entre os vereadores presentes.", 10, 204, 12, BODY_FONT, 280),
  ];
  const result = extractArticleFromRegion(items, 320, 260);
  assert.equal(result.title, "PREFEITURA ANUNCIA NOVO PROGRAMA");
  assert.equal(result.needsReview, true);
  assert.ok(result.warnings.some((w) => w.includes("Mais de um título")));
  // Nada do segundo título/corpo foi descartado — entrou no corpo para revisão.
  assert.ok(result.bodyParagraphs.join(" ").includes("CÂMARA APROVA PROJETO DE LEI"));
  assert.ok(result.bodyParagraphs.join(" ").includes("A votação ocorreu"));
});

test("título com duas linhas dentro da seleção: junta como um só título", () => {
  const items: TextItem[] = [
    item("SUPERCOOPER INAUGURA", 10, 20, 24, TITLE_FONT, 260),
    item("NOVA SEDE EM SÃO JOÃO DO SUL", 10, 50, 24, TITLE_FONT, 300),
    item("A inauguração aconteceu na manhã de ontem, reunindo autoridades locais.", 10, 90, 12, BODY_FONT, 280),
    item("O novo espaço amplia significativamente a capacidade de atendimento.", 10, 104, 12, BODY_FONT, 280),
  ];
  const result = extractArticleFromRegion(items, 320, 130);
  assert.equal(result.title, "SUPERCOOPER INAUGURA NOVA SEDE EM SÃO JOÃO DO SUL");
  assert.equal(result.needsReview, false);
});

test("hífen de fim de linha dentro do corpo da seleção é unido, igual ao motor de página inteira", () => {
  const items: TextItem[] = [
    item("ESCOLA MUNICIPAL RECEBE REFORMA", 10, 20, 24, TITLE_FONT, 300),
    item("A reforma incluiu a construção de uma nova quadra poliesporti-", 10, 50, 12, BODY_FONT, 280),
    item("va, atendendo a um pedido antigo da comunidade escolar local.", 10, 64, 12, BODY_FONT, 280),
  ];
  const result = extractArticleFromRegion(items, 320, 100);
  assert.ok(result.bodyParagraphs.join(" ").includes("poliesportiva"));
  assert.ok(!result.bodyParagraphs.join(" ").includes("poliesporti-"));
});

test("não mistura texto de fora: o chamador já restringe rawItems à região (nenhuma lógica de recorte aqui)", () => {
  // extractArticleFromRegion nunca filtra por coordenadas — isso é
  // responsabilidade do modal (PdfVisualCaptureModal), que só envia os
  // TextItems cujo centro cai dentro do retângulo desenhado.
  const items: TextItem[] = [item("SOMENTE ESTE TEXTO ENTRA", 10, 20, 24, TITLE_FONT, 300)];
  const result = extractArticleFromRegion(items, 320, 40);
  assert.ok(result.title.length > 0 || result.bodyParagraphs.length === 0);
});
