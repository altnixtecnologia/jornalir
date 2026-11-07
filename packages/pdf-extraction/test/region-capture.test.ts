import { test } from "node:test";
import assert from "node:assert/strict";
import { extractArticleFromRegion } from "../src/newspaper";
import { detectColumnSegments } from "../src/columns";
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

// ---------------------------------------------------------------------------
// Revisão de 07/11/2026 — item 1: coordenadas da seleção.
//
// `rawItems` chega a `extractArticleFromRegion` com as coordenadas
// ABSOLUTAS da página (mesmo espaço de `extractPageTextItems`), nunca
// relativas ao retângulo desenhado. A detecção de colunas monta seus
// baldes de cobertura a partir de x=0 até `areaWidth` — uma seleção longe
// da borda esquerda da página (centro, direita) tinha seus itens inteiros
// fora dessa faixa, e a estrutura de colunas nunca era reconhecida. Os
// testes abaixo reproduzem a mesma seleção em três posições absolutas da
// página (esquerda, centro, extrema direita) e confirmam resultado
// IDÊNTICO nas três — a prova de que a extração agora é independente de
// onde o operador desenhou o retângulo.
// ---------------------------------------------------------------------------

function shiftItems(items: TextItem[], dx: number, dy = 0): TextItem[] {
  return items.map((it) => ({ ...it, x: it.x + dx, yBaseline: it.yBaseline + dy }));
}

test("mecanismo do bug (nível baixo): detectColumnSegments só enxerga colunas dentro de [0, areaWidth) — itens longe da borda esquerda caem no fallback de 1 coluna sem normalizar a origem primeiro", () => {
  const colA = [{ x: 650, width: 130 }, { x: 650, width: 130 }];
  const colB = [{ x: 810, width: 130 }, { x: 810, width: 130 }];
  const raw = (x: number, width: number, y: number): TextItem => ({
    text: "x".repeat(10), x, yBaseline: y, width, fontSize: 11, fontName: "f", hasEOL: false,
  });
  const items = [...colA, ...colB].map((p, i) => raw(p.x, p.width, 20 + (i % 2) * 14));

  const withoutNormalizing = detectColumnSegments(items, 320, 100, 15);
  assert.equal(withoutNormalizing.length, 1, "sem normalizar, cai no fallback de 1 coluna só (o bug)");

  const offsetX = Math.min(...items.map((it) => it.x));
  const normalized = items.map((it) => ({ ...it, x: it.x - offsetX }));
  const withNormalizing = detectColumnSegments(normalized, 320, 100, 15);
  assert.equal(withNormalizing.length, 2, "normalizando para a origem da região, as 2 colunas reais aparecem");
});

function singleColumnArticle(): TextItem[] {
  return [
    item("ESCOLA MUNICIPAL RECEBE REFORMA COMPLETA", 10, 20, 22, TITLE_FONT, 300),
    item("A reforma incluiu a construção de uma nova quadra poliesportiva e a", 10, 55, 12, BODY_FONT, 280),
    item("reforma completa do telhado, atendendo a um pedido antigo da comunidade.", 10, 69, 12, BODY_FONT, 280),
    item("O investimento foi viabilizado por emenda parlamentar aprovada no ano passado.", 10, 83, 12, BODY_FONT, 280),
  ];
}

for (const [label, offsetX] of [["esquerda da página", 0], ["centro da página", 350], ["extrema direita da página", 700]] as const) {
  test(`seleção na ${label} (x+${offsetX}): mesmo título e corpo que na borda esquerda`, () => {
    const baseline = extractArticleFromRegion(singleColumnArticle(), 320, 100);
    const shifted = extractArticleFromRegion(shiftItems(singleColumnArticle(), offsetX), 320, 100);
    assert.equal(shifted.title, baseline.title);
    assert.deepEqual(shifted.bodyParagraphs, baseline.bodyParagraphs);
    assert.equal(shifted.needsReview, baseline.needsReview);
    assert.ok(shifted.title.length > 0, "título precisa ser reconhecido mesmo longe da borda esquerda");
  });
}

/** Região com DUAS colunas de corpo lado a lado, sob um título que cobre as duas. */
function twoColumnArticle(): TextItem[] {
  const colA = 10;
  const colB = 160;
  const colWidth = 130;
  return [
    item("CÂMARA APROVA ORÇAMENTO PARA PRÓXIMO ANO", 10, 20, 22, TITLE_FONT, 280),
    item("A proposta foi aprovada por unanimidade entre os", colA, 55, 11, BODY_FONT, colWidth),
    item("vereadores presentes na sessão de ontem à noite.", colA, 68, 11, BODY_FONT, colWidth),
    item("O texto segue agora para sanção do prefeito.", colA, 81, 11, BODY_FONT, colWidth),
    item("Entre as prioridades estão saúde e educação,", colB, 55, 11, BODY_FONT, colWidth),
    item("com reforço no orçamento das duas secretarias", colB, 68, 11, BODY_FONT, colWidth),
    item("municipais para o próximo exercício financeiro.", colB, 81, 11, BODY_FONT, colWidth),
  ];
}

// Ordem de leitura correta (coluna esquerda inteira, depois a direita,
// mesmo texto do original do jornal): junta num só parágrafo contínuo
// porque não há nenhum sinal de novo parágrafo entre o fim da coluna A e
// o início da B — igual ao que já acontece hoje na extração automática de
// página inteira (mesma função `buildBodyParagraphs`, nada mudou aqui).
const TWO_COLUMN_EXPECTED_BODY =
  "A proposta foi aprovada por unanimidade entre os vereadores presentes na sessão de ontem à noite. " +
  "O texto segue agora para sanção do prefeito. Entre as prioridades estão saúde e educação, com reforço " +
  "no orçamento das duas secretarias municipais para o próximo exercício financeiro.";

for (const [label, offsetX] of [["esquerda", 0], ["centro", 300], ["extrema direita", 650]] as const) {
  test(`seleção com DUAS colunas na ${label} da página: título único e corpo na ordem de leitura correta (coluna A inteira, depois a B)`, () => {
    const result = extractArticleFromRegion(shiftItems(twoColumnArticle(), offsetX), 320, 100);
    assert.equal(result.title, "CÂMARA APROVA ORÇAMENTO PARA PRÓXIMO ANO");
    // Igualdade exata (não só "includes"): sem a correção de coordenadas,
    // `detectColumnSegments` não reconhece as 2 colunas fora da borda
    // esquerda e cai no retângulo inteiro como 1 coluna só — o texto ainda
    // aparece (nada é perdido), mas fora de ordem/estrutura. A comparação
    // exata é o que de fato prova que as colunas foram respeitadas.
    assert.deepEqual(result.bodyParagraphs, [TWO_COLUMN_EXPECTED_BODY], `em "${label}"`);
    assert.equal(result.needsReview, false);
  });
}

// ---------------------------------------------------------------------------
// Revisão de 07/11/2026 — item 2: matérias curtas.
//
// MIN_ARTICLE_BODY_CHARS (120 caracteres) continua valendo só para a
// extração automática de página inteira (protege contra anúncios/selos
// curtos sendo lidos como matéria). Na captura visual, a seleção manual do
// operador já expressa a intenção editorial — uma nota curta nunca pode
// ser descartada silenciosamente só por ter pouco texto.
// ---------------------------------------------------------------------------

test("nota curta (corpo bem abaixo de 120 caracteres): título e corpo preservados, nunca descartados", () => {
  const items: TextItem[] = [
    item("PREFEITURA CONFIRMA FERIADO", 10, 20, 20, TITLE_FONT, 260),
    item("Ponto facultativo nesta sexta-feira.", 10, 48, 12, BODY_FONT, 240),
  ];
  const bodyChars = "Ponto facultativo nesta sexta-feira.".length;
  assert.ok(bodyChars < 120, "a nota de teste precisa ser mesmo curta (< 120 caracteres)");
  const result = extractArticleFromRegion(items, 280, 60);
  assert.equal(result.title, "PREFEITURA CONFIRMA FERIADO");
  assert.deepEqual(result.bodyParagraphs, ["Ponto facultativo nesta sexta-feira."]);
  assert.equal(result.needsReview, false);
  assert.deepEqual(result.warnings, []);
});

test("nota curtíssima, só uma frase de poucas palavras: título e corpo continuam presentes", () => {
  const items: TextItem[] = [
    item("TRÂNSITO INTERDITADO", 10, 20, 20, TITLE_FONT, 220),
    item("Rua Central fechada até domingo.", 10, 46, 12, BODY_FONT, 220),
  ];
  const result = extractArticleFromRegion(items, 260, 55);
  assert.equal(result.title, "TRÂNSITO INTERDITADO");
  assert.equal(result.bodyParagraphs.join(" "), "Rua Central fechada até domingo.");
});
