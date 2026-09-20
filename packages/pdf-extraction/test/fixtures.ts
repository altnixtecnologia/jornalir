import { PDFDocument, PDFFont, PDFPage, StandardFonts } from "pdf-lib";

const PAGE_WIDTH = 900;
const PAGE_HEIGHT = 800;
export const BODY_SIZE = 10;
export const TITLE_SIZE = 18;
export const SUBTITLE_SIZE = 13;
const LINE_GAP = 14;
const PARAGRAPH_GAP = 24;
const TITLE_GAP = 20;
export const SECTION_GAP = 70;

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

interface Cursor {
  y: number;
}

interface FixtureFonts {
  regular: PDFFont;
  bold: PDFFont;
}

async function createDocument(): Promise<{ pdfDoc: PDFDocument; page: PDFPage; fonts: FixtureFonts }> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { pdfDoc, page, fonts: { regular, bold } };
}

function drawParagraph(
  page: PDFPage,
  lines: string[],
  x: number,
  cursor: Cursor,
  size: number,
  font: PDFFont,
  internalLineGap: number = LINE_GAP,
): void {
  for (const line of lines) {
    page.drawText(line, { x, y: cursor.y, size, font });
    cursor.y -= internalLineGap;
  }
}

function addExtraGap(cursor: Cursor, extra: number): void {
  cursor.y -= extra;
}

/** Desenha uma única linha lógica como dois itens de texto separados (simula um PDF que fragmenta a linha por kerning/justificação). */
function drawSplitLine(
  page: PDFPage,
  part1: string,
  part2: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
): void {
  page.drawText(part1, { x, y, size, font });
  const width1 = font.widthOfTextAtSize(part1, size);
  const spaceWidth = font.widthOfTextAtSize(" ", size);
  page.drawText(part2, { x: x + width1 + spaceWidth, y, size, font });
}

export interface FixtureExpectation {
  title?: string;
  subtitle?: string;
  bodyParagraphs: string[];
}

export interface Fixture {
  bytes: Uint8Array;
  expected: FixtureExpectation;
}

/** 1) Matéria de uma única coluna: título + corpo em dois parágrafos, com uma imagem embutida. */
export async function buildSingleColumnFixture(): Promise<Fixture> {
  const { pdfDoc, page, fonts } = await createDocument();
  const cursor: Cursor = { y: 750 };

  const title = "Prefeitura anuncia nova praça no bairro Centro";
  drawParagraph(page, [title], 50, cursor, TITLE_SIZE, fonts.bold, TITLE_GAP);

  const paragraph1 = [
    "A prefeitura confirmou nesta semana o início das obras da nova",
    "praça pública, que deve atender moradores de toda a região central.",
  ];
  drawParagraph(page, paragraph1, 50, cursor, BODY_SIZE, fonts.regular);
  addExtraGap(cursor, PARAGRAPH_GAP - LINE_GAP);

  const paragraph2 = [
    "O investimento total ultrapassa quinhentos mil reais e inclui",
    "iluminacao, bancos e uma area especifica para criancas.",
  ];
  drawParagraph(page, paragraph2, 50, cursor, BODY_SIZE, fonts.regular);

  const pngBytes = Buffer.from(TINY_PNG_BASE64, "base64");
  const image = await pdfDoc.embedPng(pngBytes);
  page.drawImage(image, { x: 400, y: 600, width: 80, height: 80 });

  const bytes = await pdfDoc.save();
  return {
    bytes,
    expected: {
      title,
      bodyParagraphs: [paragraph1.join(" "), paragraph2.join(" ")],
    },
  };
}

/** 2) Duas colunas independentes, cada uma com sua própria matéria (título + corpo). */
export async function buildTwoColumnFixture(): Promise<{
  bytes: Uint8Array;
  columnOne: FixtureExpectation;
  columnTwo: FixtureExpectation;
}> {
  const { pdfDoc, page, fonts } = await createDocument();

  const leftX = 50;
  const rightX = 480;

  const titleLeft = "Time local vence amistoso no fim de semana";
  const bodyLeft = ["A equipe venceu por dois a um em partida disputada", "no estadio municipal na tarde de sabado."];
  const leftCursor: Cursor = { y: 750 };
  drawParagraph(page, [titleLeft], leftX, leftCursor, TITLE_SIZE, fonts.bold, TITLE_GAP);
  drawParagraph(page, bodyLeft, leftX, leftCursor, BODY_SIZE, fonts.regular);

  const titleRight = "Feira de artesanato movimenta praca central";
  const bodyRight = ["Expositores de toda a regiao participam do evento,", "que segue aberto ao publico ate domingo."];
  const rightCursor: Cursor = { y: 750 };
  drawParagraph(page, [titleRight], rightX, rightCursor, TITLE_SIZE, fonts.bold, TITLE_GAP);
  drawParagraph(page, bodyRight, rightX, rightCursor, BODY_SIZE, fonts.regular);

  const bytes = await pdfDoc.save();
  return {
    bytes,
    columnOne: { title: titleLeft, bodyParagraphs: [bodyLeft.join(" ")] },
    columnTwo: { title: titleRight, bodyParagraphs: [bodyRight.join(" ")] },
  };
}

/** 3) Título + subtítulo + corpo, com hierarquia de fonte clara entre os três. */
export async function buildTitleSubtitleBodyFixture(): Promise<Fixture> {
  const { pdfDoc, page, fonts } = await createDocument();
  const cursor: Cursor = { y: 750 };

  const title = "Conselho aprova novo plano de mobilidade urbana";
  drawParagraph(page, [title], 50, cursor, TITLE_SIZE, fonts.bold, TITLE_GAP);

  const subtitle = "Medida deve reduzir congestionamentos no centro da cidade";
  drawParagraph(page, [subtitle], 50, cursor, SUBTITLE_SIZE, fonts.bold, TITLE_GAP);

  const body = ["O plano prevê novas faixas exclusivas para ônibus e", "ciclovias em pelo menos cinco avenidas principais."];
  drawParagraph(page, body, 50, cursor, BODY_SIZE, fonts.regular);

  const bytes = await pdfDoc.save();
  return { bytes, expected: { title, subtitle, bodyParagraphs: [body.join(" ")] } };
}

/** 4) Caracteres acentuados, incluindo uma linha fragmentada em dois itens de texto. */
export async function buildAccentedCharactersFixture(): Promise<Fixture> {
  const { pdfDoc, page, fonts } = await createDocument();
  const cursor: Cursor = { y: 750 };

  const title = "Município investe em educação e saúde pública";
  drawParagraph(page, [title], 50, cursor, TITLE_SIZE, fonts.bold, TITLE_GAP);

  const paragraph1 = [
    "É preciso investir em educação, saúde e segurança pública para",
    "toda a região, com atenção especial à zona rural e às comunidades",
    "tradicionais do município.",
  ];
  drawParagraph(page, paragraph1, 50, cursor, BODY_SIZE, fonts.regular);
  addExtraGap(cursor, PARAGRAPH_GAP - LINE_GAP);

  const splitLinePart1 = "A administração pública";
  const splitLinePart2 = "informará os valores.";
  const splitLineExpected = `${splitLinePart1} ${splitLinePart2}`;
  drawSplitLine(page, splitLinePart1, splitLinePart2, 50, cursor.y, BODY_SIZE, fonts.regular);
  cursor.y -= LINE_GAP;

  const bytes = await pdfDoc.save();
  return {
    bytes,
    expected: {
      title,
      bodyParagraphs: [paragraph1.join(" "), splitLineExpected],
    },
  };
}

export interface AdvertisementFixtureExpectation {
  articleA: FixtureExpectation;
  adText: string;
  articleB: FixtureExpectation;
}

/** 5) Página com um bloco curto e isolado entre duas matérias reais (simula anúncio). */
export async function buildAdvertisementNearbyFixture(): Promise<{
  bytes: Uint8Array;
  expected: AdvertisementFixtureExpectation;
}> {
  const { pdfDoc, page, fonts } = await createDocument();
  const cursor: Cursor = { y: 750 };

  const titleA = "Câmara discute orçamento para o próximo ano";
  const bodyA = ["Vereadores analisam propostas de investimento em", "saúde, educação e infraestrutura urbana."];
  drawParagraph(page, [titleA], 50, cursor, TITLE_SIZE, fonts.bold, TITLE_GAP);
  drawParagraph(page, bodyA, 50, cursor, BODY_SIZE, fonts.regular);

  addExtraGap(cursor, SECTION_GAP - LINE_GAP);
  const adLines = ["Loja Cooper: liquidação total.", "Descontos de até 50%."];
  drawParagraph(page, adLines, 50, cursor, BODY_SIZE, fonts.regular);
  const adText = adLines.join(" ");

  addExtraGap(cursor, SECTION_GAP - LINE_GAP);
  const titleB = "Escola municipal recebe reforma completa";
  const bodyB = ["As obras incluem nova quadra coberta e biblioteca", "equipada com computadores para os alunos."];
  drawParagraph(page, [titleB], 50, cursor, TITLE_SIZE, fonts.bold, TITLE_GAP);
  drawParagraph(page, bodyB, 50, cursor, BODY_SIZE, fonts.regular);

  const bytes = await pdfDoc.save();
  return {
    bytes,
    expected: {
      articleA: { title: titleA, bodyParagraphs: [bodyA.join(" ")] },
      adText,
      articleB: { title: titleB, bodyParagraphs: [bodyB.join(" ")] },
    },
  };
}

export interface ContinuationFixtureExpectation {
  columnOneText: string;
  columnTwoText: string;
}

/** 6) Matéria que começa na coluna 1 e continua na coluna 2, sem título na continuação. */
export async function buildContinuationAcrossColumnsFixture(): Promise<{
  bytes: Uint8Array;
  expected: ContinuationFixtureExpectation;
}> {
  const { pdfDoc, page, fonts } = await createDocument();

  const leftX = 50;
  const rightX = 480;

  const title = "Prefeitura amplia programa de coleta seletiva";
  const bodyLeft = [
    "O programa passa a atender mais oito bairros a partir do próximo",
    "mês, segundo a secretaria de meio ambiente, que destacou que a",
    "iniciativa deve",
  ];
  const leftCursor: Cursor = { y: 750 };
  drawParagraph(page, [title], leftX, leftCursor, TITLE_SIZE, fonts.bold, TITLE_GAP);
  drawParagraph(page, bodyLeft, leftX, leftCursor, BODY_SIZE, fonts.regular);

  const bodyRight = ["beneficiar cerca de duzentas famílias na região", "nos próximos seis meses."];
  const rightCursor: Cursor = { y: 750 };
  drawParagraph(page, bodyRight, rightX, rightCursor, BODY_SIZE, fonts.regular);

  const bytes = await pdfDoc.save();
  return {
    bytes,
    expected: {
      columnOneText: bodyLeft.join(" "),
      columnTwoText: bodyRight.join(" "),
    },
  };
}

/** 7) Página sem nenhuma camada de texto (equivalente a uma página digitalizada). */
export async function buildNoTextLayerFixture(): Promise<{ bytes: Uint8Array }> {
  const { pdfDoc, page } = await createDocument();
  page.drawRectangle({ x: 50, y: 50, width: 500, height: 700, borderWidth: 1 });
  const bytes = await pdfDoc.save();
  return { bytes };
}

/** Cresce uma linha (repetindo um preenchimento neutro) até atingir a largura mínima pedida — usado para garantir, de forma determinística (por métrica de fonte real, não por contagem de caracteres estimada), que uma linha "larga" realmente invade a faixa de x onde uma coluna estreita lateral existiria. */
function widenLineToWidth(font: PDFFont, size: number, base: string, minWidth: number): string {
  const filler = " informações adicionais de preenchimento para o teste automatizado";
  let text = base;
  while (font.widthOfTextAtSize(text, size) < minWidth) {
    text += filler;
  }
  return text;
}

export interface MixedLayoutFixtureExpectation {
  /** Presente apenas em linhas do artigo largo (topo e base da página, atravessando toda a largura). */
  wideMarker: string;
  /** Presente apenas na coluna estreita esquerda da faixa intermediária. */
  narrowLeftMarker: string;
  /** Presente apenas na coluna estreita direita (ex.: horóscopo) da faixa intermediária. */
  narrowRightMarker: string;
}

/**
 * 8) Diagramação mista real (Achado 2 da Fase 10, `docs/PDF-REAL-VALIDATION.md`):
 * uma matéria corrida ocupa a largura inteira da página no topo e na base,
 * mas uma faixa intermediária tem duas colunas lado a lado — uma larga
 * (continuação da matéria) e uma estreita (ex.: horóscopo). Um detector de
 * colunas que olha só para a página inteira nunca vê o vão entre as duas
 * colunas da faixa do meio, porque nas faixas de topo/base já há tinta
 * cobrindo exatamente aquela faixa de x. Reproduz o defeito relatado na
 * Fase 10 (texto de assuntos diferentes se misturando na mesma linha).
 */
export async function buildMixedLayoutFixture(): Promise<{
  bytes: Uint8Array;
  expected: MixedLayoutFixtureExpectation;
}> {
  const { pdfDoc, page, fonts } = await createDocument();
  const cursor: Cursor = { y: 750 };

  const wideMarker = "MARCADORARTIGOLARGO";
  const narrowLeftMarker = "MARCADORCOLUNAESQUERDA";
  const narrowRightMarker = "MARCADORHOROSCOPO";

  // Topo: matéria corrida atravessando quase toda a largura da página
  // (x=50 até bem além de x=650, onde a coluna estreita vai existir mais
  // abaixo) — título + parágrafo largo.
  const title = "Prefeitura anuncia reforma completa do centro histórico da cidade";
  drawParagraph(page, [title], 50, cursor, TITLE_SIZE, fonts.bold, TITLE_GAP);
  const topLines = Array.from({ length: 8 }, (_, i) =>
    widenLineToWidth(fonts.regular, BODY_SIZE, `${wideMarker} linha de topo número ${i + 1} da matéria.`, 780),
  );
  drawParagraph(page, topLines, 50, cursor, BODY_SIZE, fonts.regular);

  // Vão real entre seções — bem maior que uma banda de detecção de região,
  // para que nenhuma banda contenha conteúdo de duas seções estruturalmente
  // diferentes ao mesmo tempo (o que aconteceria em diagramações reais onde
  // as seções não colam uma na outra sem nenhum espaço).
  addExtraGap(cursor, 2 * SECTION_GAP - LINE_GAP);
  const middleTop = cursor.y;

  // Faixa intermediária: coluna esquerda larga (continuação da matéria,
  // x=50 a ~550) ao lado de uma coluna estreita (horóscopo, x=650 a ~850) —
  // nenhuma das duas se estende sobre a outra.
  const leftLines = Array.from(
    { length: 10 },
    (_, i) => `${narrowLeftMarker} continuação da matéria, parágrafo número ${i + 1} desta coluna larga.`,
  );
  const leftCursor: Cursor = { y: middleTop };
  drawParagraph(page, leftLines, 50, leftCursor, BODY_SIZE, fonts.regular);

  const rightLines = Array.from({ length: 10 }, (_, i) => `${narrowRightMarker} signo número ${i + 1}: dia favorável.`);
  const rightCursor: Cursor = { y: middleTop };
  drawParagraph(page, rightLines, 650, rightCursor, BODY_SIZE, fonts.regular);

  cursor.y = Math.min(leftCursor.y, rightCursor.y);
  addExtraGap(cursor, 2 * SECTION_GAP - LINE_GAP);

  // Base: matéria volta a ocupar a largura inteira da página.
  const bottomLines = Array.from({ length: 8 }, (_, i) =>
    widenLineToWidth(fonts.regular, BODY_SIZE, `${wideMarker} linha de base número ${i + 1} da matéria.`, 780),
  );
  drawParagraph(page, bottomLines, 50, cursor, BODY_SIZE, fonts.regular);

  const bytes = await pdfDoc.save();
  return { bytes, expected: { wideMarker, narrowLeftMarker, narrowRightMarker } };
}
