import { test } from "node:test";
import assert from "node:assert/strict";
import { joinTextLines, layoutNewspaperPage, parseFontStyle } from "../src/newspaper";
import type { ArticleGroup, TextItem } from "../src/types";

// Página sintética com as medidas reais do Informativo Regional (793,7 ×
// 1034,65pt; cabeçalho em y≈45; colunas de 113pt com calha de ~11pt; corpo
// Times ~12pt; título Gotham-Black ~24pt; subtítulo Arial-Bold ~13pt).
const W = 793.7;
const H = 1034.65;
const BODY = "INTWUI+TimesNewRomanPSMT";
const INTERTITLE = "PIDMOU+TimesNewRomanPS-BoldItalicMT";
const TITLE = "TLHPSM+Gotham-Black";
const SUBTITLE = "TDJUSM+Arial-BoldMT";
const COLUMNS = [28.4, 153.2, 277.9, 402.6, 527.3, 652.0];
const COLUMN_WIDTH = 113.4;

function item(text: string, x: number, y: number, size: number, font: string, width?: number): TextItem {
  return {
    text,
    x,
    yBaseline: y,
    width: width ?? Math.min(COLUMN_WIDTH, text.length * size * 0.5),
    fontSize: size,
    fontName: font,
    realFontName: font,
    hasEOL: false,
  };
}

function header(section: string, page: number): TextItem[] {
  return [
    item("Informativo Regional -", 522.8, 43.1, 10, "RVGDQQ+Gotham-Bold", 113.9),
    item("05 de novembro de 2026", 639.7, 43.1, 10, "FYHJEO+Gotham-Light", 125.1),
    item(String(page).padStart(2, "0"), 30.7, 47.4, 24, TITLE, 32.3),
    item(section, 272.1, 43.3, 18, "YQVTKC+KhmerUI-Bold", 135.9),
  ];
}

/** Uma coluna de corpo: cada string é uma linha; "§" no início = recuo de parágrafo. */
function column(lines: string[], columnIndex: number, yStart: number, font = BODY): TextItem[] {
  const x = COLUMNS[columnIndex];
  return lines.map((raw, index) => {
    const indented = raw.startsWith("§");
    const text = indented ? raw.slice(1) : raw;
    const lineX = indented ? x + 11.3 : x;
    const isLast = index === lines.length - 1 || lines[index + 1].startsWith("§");
    const width = isLast ? Math.min(COLUMN_WIDTH - (lineX - x), text.length * 5.5) : COLUMN_WIDTH - (lineX - x);
    return item(text, lineX, yStart + index * 11, 12, font, width);
  });
}

function textOf(group: ArticleGroup, role: "title" | "subtitle" | "body"): string[] {
  return group.blocks.filter((block) => block.role === role).map((block) => block.text);
}

test("estilo da fonte: negrito/itálico pelo nome real da fonte embutida", () => {
  assert.deepEqual(parseFontStyle("TLHPSM+Gotham-Black"), { family: "Gotham", bold: true, italic: false });
  assert.deepEqual(parseFontStyle("INTWUI+TimesNewRomanPSMT"), { family: "TimesNewRoman", bold: false, italic: false });
  assert.deepEqual(parseFontStyle("PIDMOU+TimesNewRomanPS-BoldItalicMT"), { family: "TimesNewRoman", bold: true, italic: true });
  assert.deepEqual(parseFontStyle("TDJUSM+Arial-BoldMT"), { family: "Arial", bold: true, italic: false });
  assert.deepEqual(parseFontStyle(undefined), { family: "?", bold: false, italic: false });
});

test("hífen de fim de linha: junta a palavra partida e preserva os compostos", () => {
  assert.equal(joinTextLines(["O Campeonato Mu-", "nicipal de Futebol"]), "O Campeonato Municipal de Futebol");
  assert.equal(joinTextLines(["na segunda-", "feira (02)"]), "na segunda-feira (02)");
  assert.equal(joinTextLines(["o evento realizou-", "se no domingo"]), "o evento realizou-se no domingo");
  assert.equal(joinTextLines(["a clas-", "se política"]), "a classe política");
  assert.equal(joinTextLines(["na BR-", "101, em Palhoça"]), "na BR-101, em Palhoça");
  assert.equal(joinTextLines(["o vice-", "-presidente Cesar"]), "o vice-presidente Cesar");
  assert.equal(joinTextLines(["abrem ao meio-", "dia"]), "abrem ao meio-dia");
  assert.equal(joinTextLines(["o plano de ex-", "pansão regional"]), "o plano de expansão regional");
  assert.equal(joinTextLines(["realizá-", "lo logo"]), "realizá-lo logo");
});

test("capa e páginas de publicidade não geram matérias", () => {
  const cover = layoutNewspaperPage([item("QUALQUER TÍTULO DA CAPA", 40, 300, 26, TITLE, 500)], W, H, { pageNumber: 1 });
  assert.equal(cover.articleGroups.length, 0);
  assert.match(cover.skipped ?? "", /capa/);

  const ads = layoutNewspaperPage(
    [...header("Publicidade", 4), item("BLACK FRIDAY", 100, 300, 40, TITLE, 300), ...column(["Confira as ofertas."], 0, 400)],
    W,
    H,
    { pageNumber: 4 },
  );
  assert.equal(ads.articleGroups.length, 0);
  assert.match(ads.skipped ?? "", /publicidade/);
});

test("matéria completa: cabeçalho fora, título em 2 linhas inteiro, subtítulo e corpo lido coluna por coluna", () => {
  const items = [
    ...header("São João do Sul", 2),
    item("SUPERCOOPER II INAUGURA NOVA SEDE NA", 43.5, 100, 19.92, TITLE, 457.4),
    item("SEGUNDA-FEIRA, 09 DE NOVEMBRO", 85.8, 127, 19.92, TITLE, 372.8),
    item("A solenidade de inauguração acontece às 19:30h, na Rua Jaime Grundler.", 39.9, 145, 11.18, SUBTITLE, 475.9),
    ...column(
      [
        "§Seguindo com a sua",
        "linha de investimentos e",
        "buscando melhorar ain-",
        "da mais o atendimento,",
        "o Supermercado inaugu-",
      ],
      0,
      175,
    ),
    ...column(["ra na segunda-feira o", "mais completo supermer-", "cado da cidade.", "§O novo estabelecimento", "tem 12 salas comerciais."], 1, 175),
  ];
  const result = layoutNewspaperPage(items, W, H, { pageNumber: 2 });
  assert.equal(result.articleGroups.length, 1);
  const [group] = result.articleGroups;
  assert.deepEqual(textOf(group, "title"), ["SUPERCOOPER II INAUGURA NOVA SEDE NA SEGUNDA-FEIRA, 09 DE NOVEMBRO"]);
  assert.deepEqual(textOf(group, "subtitle"), ["A solenidade de inauguração acontece às 19:30h, na Rua Jaime Grundler."]);
  assert.deepEqual(textOf(group, "body"), [
    "Seguindo com a sua linha de investimentos e buscando melhorar ainda mais o atendimento, o Supermercado inaugura na segunda-feira o mais completo supermercado da cidade.",
    "O novo estabelecimento tem 12 salas comerciais.",
  ]);
  const allText = group.blocks.map((block) => block.text).join(" ");
  assert.ok(!allText.includes("Informativo Regional -"), "cabeçalho da página nunca entra na matéria");
  assert.ok(!allText.includes("São João do Sul") || allText.includes("Rua Jaime"), "editoria do cabeçalho fica de fora");
  assert.equal(group.lowConfidenceTitle, false);
});

test("intertítulo em negrito-itálico vira parágrafo próprio, mesmo em duas linhas", () => {
  const items = [
    ...header("Região", 3),
    item("CAMPEONATO MUNICIPAL AVANÇA PARA FASE DECISIVA", 37.2, 100, 24.24, TITLE, 718.5),
    ...column(["§O domingo foi de goleadas", "no Complexo Esportivo.", "§A competição segue no", "próximo fim de semana."], 0, 130),
    item("Próximos", 60, 185, 12, INTERTITLE, 50),
    item("jogos", 66, 196, 12, INTERTITLE, 30),
    ...column(["§No sábado, Vila Conceição", "x Forquilhinha se enfren-", "tam às 13:45h."], 0, 207),
  ];
  const result = layoutNewspaperPage(items, W, H, { pageNumber: 3 });
  const [group] = result.articleGroups;
  assert.deepEqual(textOf(group, "body"), [
    "O domingo foi de goleadas no Complexo Esportivo.",
    "A competição segue no próximo fim de semana.",
    "Próximos jogos",
    "No sábado, Vila Conceição x Forquilhinha se enfrentam às 13:45h.",
  ]);
});

test("duas matérias com títulos lado a lado na mesma altura não se misturam", () => {
  const items = [
    ...header("Região", 6),
    item("CRESOL COMEMORA 15 ANOS", 30, 100, 20, TITLE, 330),
    item("SENAR E EPAGRI PROMOVEM", 410, 100, 20, TITLE, 330),
    item("COM LANÇAMENTO DO SAFRA", 30, 124, 20, TITLE, 330),
    item("CURSO DE FRUTOS DO MAR", 410, 124, 20, TITLE, 330),
    ...column(["§A Cresol completou 15", "anos de fundação no dia", "23 de maio deste ano e", "comemorou com taxas di-", "ferenciadas no crédito."], 0, 150),
    ...column(["§Houve também a posse", "da nova diretoria, com", "José de Souza na presi-", "dência da cooperativa."], 1, 150),
    ...column(["§O curso de processamento", "reuniu mulheres da co-", "munidade em junho, com", "receitas a base de pei-", "xes e camarões."], 3, 150),
    ...column(["§As aulas foram práticas", "e gratuitas, oferecidas", "pelo SENAR e pela EPA-", "GRI no salão da igreja."], 4, 150),
  ];
  const result = layoutNewspaperPage(items, W, H, { pageNumber: 6 });
  assert.equal(result.articleGroups.length, 2);
  const [left, right] = result.articleGroups;
  assert.deepEqual(textOf(left, "title"), ["CRESOL COMEMORA 15 ANOS COM LANÇAMENTO DO SAFRA"]);
  assert.deepEqual(textOf(right, "title"), ["SENAR E EPAGRI PROMOVEM CURSO DE FRUTOS DO MAR"]);
  assert.ok(textOf(left, "body").join(" ").includes("nova diretoria"));
  assert.ok(!textOf(left, "body").join(" ").includes("curso"));
  assert.ok(textOf(right, "body").join(" ").includes("comunidade em junho"));
  assert.ok(!textOf(right, "body").join(" ").includes("Cresol"));
});

test("título de anúncio sem corpo e edital da prefeitura não viram rascunho", () => {
  const items = [
    ...header("Região", 13),
    item("ENERGIA SOLAR", 527, 100, 22, TITLE, 230),
    item("INSTALAÇÕES ELÉTRICAS", 527, 130, 22, TITLE, 230),
    item("ESTADO DE SANTA CATARINA PREFEITURA MUNICIPAL DE", 30, 400, 20, TITLE, 470),
    ...column(
      [
        "Objeto: O presente procedi-",
        "mento licitatório tem por",
        "finalidade registrar preços",
        "para futura contratação de",
        "empresa para serviços de",
        "horas máquina pesada nos",
        "termos do edital e anexos.",
      ],
      0,
      430,
    ),
  ];
  const result = layoutNewspaperPage(items, W, H, { pageNumber: 13 });
  assert.equal(result.articleGroups.length, 0);
});

test("texto corrido sem nenhum título acima não vira 'matéria sem título' — fica registrado em aviso", () => {
  const items = [
    ...header("Região", 9),
    ...column(["§Texto solto de uma coluna", "de notas, sem nenhum título", "identificável acima dele."], 0, 120),
  ];
  const result = layoutNewspaperPage(items, W, H, { pageNumber: 9 });
  assert.equal(result.articleGroups.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("sem título identificável")));
  assert.ok(result.paragraphs.length > 0, "o texto entra no catálogo para a auditoria de conservação acusar a perda");
});
