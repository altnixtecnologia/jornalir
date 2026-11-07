import { assignSegment, detectColumnSegments } from "./columns";
import type { ArticleBlock, ArticleGroup, ColumnSegment, Line, Paragraph, TextItem } from "./types";

/**
 * Modo jornal (calibrado com as edições reais do Informativo Regional,
 * 2021–2026). Usa a diagramação do próprio jornal, não o conteúdo:
 *
 * - cabeçalho da página (nome do jornal, data, número da página, editoria)
 *   fica sempre na faixa do topo — é descartado, nunca vira matéria;
 * - página cuja editoria do cabeçalho é "Publicidade" não gera matérias;
 * - TÍTULO = linhas em fonte bem maior que o corpo e em MAIÚSCULAS; linhas
 *   seguidas do mesmo título (título em 2–3 linhas) formam um título só;
 * - SUBTÍTULO = linhas logo abaixo do título, em outra fonte (em geral
 *   negrito e/ou itálico), antes do corpo;
 * - CORPO = a fonte de texto corrido mais usada na página (ex.: Times
 *   11,5–12,5pt), lida coluna por coluna (colunas estreitas, ~11pt de
 *   calha), com parágrafo novo no recuo da primeira linha;
 * - cada linha de corpo pertence ao título mais próximo acima dela que
 *   cobre a mesma faixa horizontal;
 * - título sem corpo (texto grande de anúncio) não gera matéria.
 *
 * Nunca inventa texto: só reorganiza o que está no PDF. A única
 * normalização é juntar a palavra partida por hífen no fim da linha
 * ("Mu-" + "nicipal" → "Municipal"), mantendo hífens de palavras
 * compostas ("segunda-feira", "realizou-se", "BR-101").
 */

export interface FontStyle {
  family: string;
  bold: boolean;
  italic: boolean;
}

export function parseFontStyle(realName: string | undefined): FontStyle {
  if (!realName) return { family: "?", bold: false, italic: false };
  const name = realName.replace(/^[A-Z]{6}\+/, "");
  const [familyPart, ...styleParts] = name.split(/[-,]/);
  const styleSource = styleParts.length > 0 ? styleParts.join("-") : name;
  const family = familyPart.replace(/(PSMT|PS|MT)$/, "") || familyPart;
  return {
    family,
    bold: /bold|black|heavy|demi|semibold|extrabold|ultra/i.test(styleSource),
    italic: /italic|oblique/i.test(styleSource),
  };
}

export function uppercaseRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const upper = letters.filter((letter) => /\p{Lu}/u.test(letter)).length;
  return upper / letters.length;
}

// ---------------------------------------------------------------------------
// Junção de linhas (hífen de fim de linha)
// ---------------------------------------------------------------------------

/** Segunda parte de palavras compostas comuns no jornal: "segunda-/feira", "vice-/prefeito", "meio-/dia", "guarda-/sóis". */
const COMPOUND_SECOND_PART =
  /^(feira|feiras|dia|dias|sóis|sol|chuva|chuvas|estar|vindo|vinda|vindos|vindas|geral|gerais|prefeito|prefeita|prefeitos|prefeitas|presidente|presidentes|governador|governadora|diretor|diretora|reitor|reitora|secretário|secretária|vereador|vereadora|deputado|deputada|ministro|ministra|campeão|campeã|campeões|atleta|atletas|jogador|jogadora)$/i;

function shouldDropLineHyphen(previous: string, next: string): boolean {
  if (!/^\p{Ll}/u.test(next)) return false; // "BR-" + "101", "Super-" + "Cooper": mantém
  if (!/\p{L}$/u.test(previous)) return false;
  const prev = previous.toLowerCase();
  const nxt = next.toLowerCase();
  if (COMPOUND_SECOND_PART.test(nxt)) return false; // segunda-/feira, vice-/prefeito
  if (prev === "vice" || prev === "recém") return false;
  if (nxt === "se" && prev.length >= 3 && !prev.endsWith("s")) return false; // realizou-/se (mas clas-/se)
  if (/^(lo|la|los|las)$/.test(nxt) && /[áéêíóôú]$/.test(prev)) return false; // realizá-/lo
  if (/^(lhe|lhes)$/.test(nxt) && prev.length >= 3) return false; // disse-/lhe
  return true;
}

export function joinTextLines(lines: string[]): string {
  let out = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const hyphenated = out.match(/([\p{L}\d]+)-$/u);
    const nextToken = line.match(/^[\p{L}\d]+/u)?.[0] ?? "";
    if (hyphenated && /^-\p{L}/u.test(line)) {
      // Regra tipográfica: composto partido no hífen repete o hífen na
      // linha seguinte ("vice-" / "-presidente") → "vice-presidente".
      out += line.slice(1);
    } else if (hyphenated && nextToken) {
      out = shouldDropLineHyphen(hyphenated[1], nextToken) ? out.slice(0, -1) + line : out + line;
    } else {
      out += ` ${line}`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Estrutura interna
// ---------------------------------------------------------------------------

interface StyledItem extends TextItem {
  style: FontStyle;
}

interface StyledLine extends Line {
  yTop: number;
  style: FontStyle;
  items: StyledItem[];
}

interface Headline {
  lines: StyledLine[];
  x0: number;
  x1: number;
  yTop: number;
  yBottom: number;
  fontSize: number;
}

interface BodyLine extends StyledLine {
  segment: number;
  /** Corpo em negrito/itálico (intertítulo dentro da matéria). */
  emphasis: boolean;
}

export interface NewspaperPageLayout {
  /** Motivo quando a página inteira não gera matérias (capa, publicidade, sem corpo). */
  skipped?: string;
  columnSegments: ColumnSegment[];
  paragraphs: Paragraph[];
  articleGroups: ArticleGroup[];
  warnings: string[];
}

export interface NewspaperLayoutOptions {
  pageNumber: number;
}

/** Faixa do topo com o cabeçalho fixo (y da linha de base ≈ 41–49pt numa página de 1035pt). */
const HEADER_BAND_RATIO = 0.062;
const HEADLINE_MIN_SIZE_RATIO = 1.45;
const HEADLINE_MIN_UPPERCASE = 0.6;
/** Título menor (regra b): largura mínima ≈ 1,7 coluna do jornal. */
const SECONDARY_HEADLINE_MIN_WIDTH = 200;
/**
 * Publicação legal paga (edital, aviso de licitação, extrato, decreto…),
 * diagramada como matéria mas que não é notícia: não vira rascunho. O
 * cabeçalho padrão dessas publicações é "ESTADO DE SANTA CATARINA /
 * PREFEITURA MUNICIPAL DE …".
 */
const LEGAL_NOTICE_TITLE =
  /^(ESTADO D[OE] (SANTA CATARINA|RIO GRANDE DO SUL)|PREFEITURA MUNICIPAL D[EO]\b|C[ÂA]MARA MUNICIPAL D[EO]\b.*\b(EDITAL|AVISO|EXTRATO)|EDITAL\b|AVISO DE (LICITA|PREG|CHAMAMENTO|DISPENSA)|EXTRATO\b|PREG[ÃA]O (ELETR[ÔO]NICO|PRESENCIAL)|TOMADA DE PRE[ÇC]OS|PROCESSO LICITAT[ÓO]RIO|DECRETO N|PORTARIA N|LEI (MUNICIPAL|COMPLEMENTAR|ORDIN[ÁA]RIA)? ?N[º°o.])/i;

/** Matéria com menos texto de corpo que isso é tratada como anúncio/selo, não como matéria. */
const MIN_ARTICLE_BODY_CHARS = 120;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Fonte do corpo: família regular (sem negrito) com mais caracteres; tamanho = mediana ponderada. */
function detectBodyStyle(items: StyledItem[]): { family: string; size: number } | null {
  const charsByFamily = new Map<string, number>();
  for (const item of items) {
    if (item.style.bold) continue;
    charsByFamily.set(item.style.family, (charsByFamily.get(item.style.family) ?? 0) + item.text.length);
  }
  let family: string | null = null;
  let best = 0;
  for (const [name, chars] of charsByFamily) {
    if (chars > best) {
      best = chars;
      family = name;
    }
  }
  if (!family) return null;
  const sizes: number[] = [];
  for (const item of items) {
    if (item.style.family !== family || item.style.bold) continue;
    for (let i = 0; i < Math.min(item.text.length, 200); i += 1) sizes.push(item.fontSize);
  }
  return { family, size: median(sizes) };
}

/** Junta itens de uma mesma linha (mesma regra de espaço de `groupItemsIntoLines`), sem perder nenhum caractere. */
function mergeRow(row: StyledItem[]): StyledLine {
  const ordered = [...row].sort((a, b) => a.x - b.x);
  let text = "";
  let previous: StyledItem | null = null;
  for (const item of ordered) {
    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      if (gap > previous.fontSize * 0.15 && !text.endsWith(" ") && item.text.length > 0) text += " ";
    }
    text += item.text;
    previous = item;
  }
  const x = Math.min(...ordered.map((item) => item.x));
  const width = Math.max(...ordered.map((item) => item.x + item.width)) - x;
  const fontSize = Math.max(...ordered.map((item) => item.fontSize));
  const yBaseline = median(ordered.map((item) => item.yBaseline));
  const dominant = [...ordered].sort((a, b) => b.text.length - a.text.length)[0];
  return { text, x, width, yBaseline, fontSize, yTop: yBaseline - fontSize, style: dominant.style, items: ordered };
}

/**
 * Agrupa itens em linhas pela linha de base. `splitWideGaps` separa blocos
 * lado a lado na mesma altura (dois títulos vizinhos) — nunca usado no
 * corpo, onde uma linha justificada com duas palavras tem vão enorme.
 */
function toStyledLines(items: StyledItem[], splitWideGaps: boolean, headlineSize = Infinity): StyledLine[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.yBaseline - b.yBaseline || a.x - b.x);
  const rows: StyledItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(item.yBaseline - row[0].yBaseline) <= Math.max(1, row[0].fontSize * 0.35)) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }
  const lines: StyledLine[] = [];
  for (const row of rows) {
    if (!splitWideGaps) {
      lines.push(mergeRow(row));
      continue;
    }
    const ordered = [...row].sort((a, b) => a.x - b.x);
    let current: StyledItem[] = [];
    for (const item of ordered) {
      const previous = current[current.length - 1];
      const sizeRatio = previous ? Math.max(previous.fontSize, item.fontSize) / Math.min(previous.fontSize, item.fontSize) : 1;
      const otherFont = previous !== undefined && (previous.style.family !== item.style.family || sizeRatio > 1.25);
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const size = previous ? Math.max(previous.fontSize, item.fontSize) : 0;
      // Títulos não são justificados: um vão de ~1 corpo entre palavras de
      // título já indica dois títulos vizinhos na mesma altura.
      const wideGap = size >= headlineSize ? Math.max(size * 0.9, 10) : size * 2;
      if (previous && (gap > wideGap || (otherFont && gap > 2))) {
        lines.push(mergeRow(current));
        current = [];
      }
      current.push(item);
    }
    if (current.length > 0) lines.push(mergeRow(current));
  }
  return lines;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function buildHeadlines(lines: StyledLine[]): Headline[] {
  const headlines: Headline[] = [];
  const sorted = [...lines].sort((a, b) => a.yBaseline - b.yBaseline || a.x - b.x);
  for (const line of sorted) {
    const x1 = line.x + line.width;
    const target = headlines.find((headline) => {
      const last = headline.lines[headline.lines.length - 1];
      const sizeRatio = line.fontSize / last.fontSize;
      const gap = line.yBaseline - last.yBaseline;
      const horizontal = overlap(headline.x0, headline.x1, line.x, x1);
      return (
        sizeRatio > 0.8 &&
        sizeRatio < 1.25 &&
        gap > 0 &&
        gap <= last.fontSize * 1.7 &&
        horizontal >= Math.min(line.width, headline.x1 - headline.x0) * 0.3
      );
    });
    if (target) {
      target.lines.push(line);
      target.x0 = Math.min(target.x0, line.x);
      target.x1 = Math.max(target.x1, x1);
      target.yBottom = line.yBaseline;
      target.fontSize = Math.max(target.fontSize, line.fontSize);
    } else {
      headlines.push({ lines: [line], x0: line.x, x1, yTop: line.yTop, yBottom: line.yBaseline, fontSize: line.fontSize });
    }
  }
  return headlines;
}

function lineCenter(line: { x: number; width: number }): number {
  return line.x + line.width / 2;
}

/** Título dono de uma linha: o mais próximo acima que cobre o centro da linha. */
function ownerHeadline(line: { x: number; width: number; yTop: number }, headlines: Headline[], tolerance: number): number {
  const center = lineCenter(line);
  let owner = -1;
  let ownerY = -Infinity;
  headlines.forEach((headline, index) => {
    if (headline.yBottom > line.yTop + 1) return;
    if (center < headline.x0 - tolerance || center > headline.x1 + tolerance) return;
    if (headline.yBottom > ownerY) {
      ownerY = headline.yBottom;
      owner = index;
    }
  });
  return owner;
}

interface ColumnRun {
  x0: number;
  x1: number;
  lines: BodyLine[];
}

/**
 * Agrupa as linhas de corpo de uma matéria em colunas pela FAIXA horizontal
 * que ocupam (não pela margem esquerda: intertítulo centralizado e texto que
 * contorna foto começam em outro x, mas estão na mesma coluna) e as ordena
 * como se lê o jornal: coluna da esquerda para a direita, de cima para baixo.
 */
function orderBodyLines(lines: BodyLine[], bodySize: number): ColumnRun[] {
  if (lines.length === 0) return [];
  const typicalWidth = median(lines.map((line) => line.width));
  const runs: ColumnRun[] = [];
  const structural = lines.filter((line) => line.width >= bodySize * 3 && line.width <= typicalWidth * 1.6);
  for (const line of [...structural].sort((a, b) => a.x - b.x)) {
    const x1 = line.x + line.width;
    const run = runs.find((candidate) => overlap(candidate.x0, candidate.x1, line.x, x1) >= Math.min(line.width, candidate.x1 - candidate.x0) * 0.5);
    if (run) {
      run.x0 = Math.min(run.x0, line.x);
      run.x1 = Math.max(run.x1, x1);
    } else {
      runs.push({ x0: line.x, x1, lines: [] });
    }
  }
  // Funde faixas que acabaram se sobrepondo (colunas de verdade nunca se sobrepõem).
  runs.sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < runs.length; ) {
    const previous = runs[i - 1];
    const current = runs[i];
    if (overlap(previous.x0, previous.x1, current.x0, current.x1) >= Math.min(previous.x1 - previous.x0, current.x1 - current.x0) * 0.5) {
      previous.x0 = Math.min(previous.x0, current.x0);
      previous.x1 = Math.max(previous.x1, current.x1);
      runs.splice(i, 1);
    } else {
      i += 1;
    }
  }
  if (runs.length === 0) runs.push({ x0: Math.min(...lines.map((l) => l.x)), x1: Math.max(...lines.map((l) => l.x + l.width)), lines: [] });
  for (const line of lines) {
    const center = lineCenter(line);
    let best = runs[0];
    let bestDistance = Infinity;
    for (const run of runs) {
      const distance = center < run.x0 ? run.x0 - center : center > run.x1 ? center - run.x1 : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = run;
      }
    }
    best.lines.push(line);
  }
  for (const run of runs) run.lines.sort((a, b) => a.yBaseline - b.yBaseline);
  return runs.filter((run) => run.lines.length > 0);
}

interface BuiltParagraph {
  lines: BodyLine[];
  text: string;
}

const LIST_MARKER = /^\s*[-–•▪●]\s/;
const PARAGRAPH_END = /[.!?:…"'”’)]\s*$/;

/**
 * Parágrafo novo quando: a linha está recuada em relação às vizinhas (recuo
 * de primeira linha), começa com marcador de lista, vem depois de uma linha
 * curta que fechou a frase, depois de um vão vertical grande, ou quando
 * muda entre texto normal e intertítulo (negrito/itálico). O fim de uma
 * coluna NÃO fecha o parágrafo: o texto continua no topo da próxima.
 */
function buildBodyParagraphs(runs: ColumnRun[], bodySize: number): BuiltParagraph[] {
  const paragraphs: BuiltParagraph[] = [];
  let current: BodyLine[] = [];
  const leading = bodySize * 1.25;
  const flush = () => {
    if (current.length === 0) return;
    const text = joinTextLines(current.map((line) => line.text));
    if (text) paragraphs.push({ lines: current, text });
    current = [];
  };
  for (const run of runs) {
    const runWidth = run.x1 - run.x0;
    run.lines.forEach((line, index) => {
      const previous = index > 0 ? run.lines[index - 1] : null;
      const next = index + 1 < run.lines.length ? run.lines[index + 1] : null;
      const minIndent = bodySize * 0.5;
      const maxIndent = bodySize * 3.5;
      const vsPrevious = previous ? line.x - previous.x : null;
      const vsNext = next ? line.x - next.x : null;
      const indentOk = (value: number | null) => value === null || (value >= minIndent && value <= maxIndent);
      const indented = (vsPrevious !== null || vsNext !== null) && indentOk(vsPrevious) && indentOk(vsNext);
      const listItem = LIST_MARKER.test(line.text);
      const afterShortClosedLine =
        previous !== null && previous.width < runWidth * 0.7 && PARAGRAPH_END.test(previous.text.trim());
      // Vão grande só fecha o parágrafo se a frase terminou — texto que
      // contorna uma foto continua a mesma frase depois do vão.
      const gapJump =
        previous !== null &&
        line.yBaseline - previous.yBaseline > leading * 1.7 &&
        PARAGRAPH_END.test(previous.text.trim());
      const last = current[current.length - 1];
      const emphasisChange = last !== undefined && last.emphasis !== line.emphasis;
      // Intertítulo em duas linhas (centralizado): as linhas seguem juntas.
      const emphasisContinues = last !== undefined && last.emphasis && line.emphasis && !gapJump;
      if (!emphasisContinues && (indented || listItem || afterShortClosedLine || gapJump || emphasisChange)) flush();
      current.push(line);
    });
  }
  flush();
  return paragraphs;
}

function emptyLayout(skipped: string): NewspaperPageLayout {
  return { skipped, columnSegments: [], paragraphs: [], articleGroups: [], warnings: [] };
}

/**
 * Núcleo do modo jornal: dado um conjunto de itens já estilizados (fonte
 * resolvida) e já restrito à área de interesse — uma página inteira, sem o
 * cabeçalho (`layoutNewspaperPage`), ou uma região escolhida manualmente
 * pelo operador (`extractArticleFromRegion`, captura visual) — detecta a
 * fonte do corpo, títulos, subtítulos, colunas e parágrafos. As duas
 * chamadoras reaproveitam este mesmo motor calibrado; nenhuma delas tem sua
 * própria heurística de título/corpo.
 *
 * `areaLabel` só entra no texto dos avisos (ex.: "Página 7" ou "seleção").
 */
function layoutArticlesFromItems(
  content: StyledItem[],
  areaWidth: number,
  areaHeight: number,
  areaLabel: string,
): NewspaperPageLayout {
  const body = detectBodyStyle(content);
  if (!body || body.size <= 0) return emptyLayout("sem texto corrido");

  // Cada matéria é ajustada no espaço com um corpo diferente (10,3pt numa,
  // 12,5pt na vizinha, na mesma página): a faixa do corpo é larga.
  const isBodyItem = (item: StyledItem) =>
    item.style.family === body.family && item.fontSize >= body.size * 0.78 && item.fontSize <= body.size * 1.28;
  const bodyItems = content.filter(isBodyItem);
  const nonBodyLines = toStyledLines(
    content.filter((item) => !isBodyItem(item)),
    true,
    body.size * HEADLINE_MIN_SIZE_RATIO,
  );
  // Título: (a) bem maior que o corpo e em maiúsculas (Gotham-Black ~20–28pt,
  // o padrão do jornal); ou (b) páginas especiais (ex.: Eleições) com título
  // menor: negrito, TODO em maiúsculas, um pouco maior que o corpo e largo
  // (legenda de foto em negrito costuma ser estreita).
  const isHeadlineLine = (line: StyledLine) => {
    const letters = (line.text.match(/\p{L}/gu) ?? []).length;
    const upper = uppercaseRatio(line.text);
    if (letters >= 2 && line.fontSize >= body.size * HEADLINE_MIN_SIZE_RATIO && upper >= HEADLINE_MIN_UPPERCASE) return true;
    return (
      letters >= 15 &&
      line.style.bold &&
      upper >= 0.85 &&
      line.fontSize >= body.size * 1.15 &&
      line.width >= SECONDARY_HEADLINE_MIN_WIDTH
    );
  };
  const headlineLines = nonBodyLines.filter(isHeadlineLine);
  const headlines = buildHeadlines(headlineLines).filter(
    (headline) => (headline.lines.map((line) => line.text).join(" ").match(/\p{L}/gu) ?? []).length >= 8,
  );

  // Corpo: colunas detectadas só com itens de corpo (calha pequena), linhas por coluna.
  const columnSegments = detectColumnSegments(bodyItems, areaWidth, areaHeight, Math.max(5, body.size * 0.55));
  const itemsBySegment: StyledItem[][] = columnSegments.map(() => []);
  for (const item of bodyItems) itemsBySegment[assignSegment(item, columnSegments)].push(item);
  const bodyLines: BodyLine[] = itemsBySegment.flatMap((segmentItems, segment) =>
    toStyledLines(segmentItems, false).map((line) => ({
      ...line,
      segment,
      emphasis: line.items.every((item) => item.style.bold || item.style.italic),
    })),
  );

  // Subtítulo: linhas de outra fonte (em geral negrito/itálico) logo abaixo
  // do título, antes do primeiro corpo de texto embaixo dele.
  const otherLines = nonBodyLines.filter((line) => !isHeadlineLine(line));
  const usedOther = new Set<StyledLine>();
  const isBodyRegular = (line: StyledLine) => line.style.family === body.family && !line.style.bold && !line.style.italic;
  const subtitleFor = (headline: Headline): StyledLine[] => {
    const firstBodyY = Math.min(
      Infinity,
      ...bodyLines
        .filter((line) => line.yTop > headline.yBottom && lineCenter(line) >= headline.x0 && lineCenter(line) <= headline.x1)
        .map((line) => line.yTop),
    );
    const result: StyledLine[] = [];
    let lastY = headline.yBottom;
    const candidates = otherLines
      .filter((line) => !usedOther.has(line) && !isBodyRegular(line))
      .filter((line) => line.yBaseline > headline.yBottom && line.yTop < firstBodyY + 1)
      .filter((line) => line.fontSize >= body.size * 0.85)
      .filter((line) => overlap(headline.x0, headline.x1, line.x, line.x + line.width) >= line.width * 0.6)
      .sort((a, b) => a.yBaseline - b.yBaseline);
    for (const line of candidates) {
      const limit = (result.length === 0 ? headline.fontSize * 1.6 : line.fontSize * 1.9) + 2;
      if (line.yBaseline - lastY > limit) break;
      if (result.length === 0 && line.width < (headline.x1 - headline.x0) * 0.3) break;
      result.push(line);
      usedOther.add(line);
      lastY = line.yBaseline;
    }
    return result;
  };
  const headlinesInOrder = headlines
    .map((headline, index) => ({ headline, index }))
    .sort((a, b) => a.headline.yTop - b.headline.yTop || a.headline.x0 - b.headline.x0);
  const subtitles = new Map<number, StyledLine[]>();
  for (const { headline, index } of headlinesInOrder) subtitles.set(index, subtitleFor(headline));

  // Faixa de cada matéria: título + subtítulo, ampliada para as colunas de
  // corpo logo abaixo que o título cobre em boa parte (título centralizado
  // costuma ser mais estreito que as colunas da própria matéria).
  const regions: Headline[] = headlines.map((headline, index) => {
    const region = { ...headline };
    for (const line of subtitles.get(index) ?? []) {
      region.x0 = Math.min(region.x0, line.x);
      region.x1 = Math.max(region.x1, line.x + line.width);
    }
    const lookBelow = region.yBottom + body.size * 15;
    for (const segment of columnSegments) {
      if (segment.yBottom < region.yBottom || segment.yTop > lookBelow) continue;
      const width = segment.xEnd - segment.xStart;
      if (width <= 0 || width > (headline.x1 - headline.x0) * 1.2) continue;
      if (overlap(region.x0, region.x1, segment.xStart, segment.xEnd) >= width * 0.4) {
        region.x0 = Math.min(region.x0, segment.xStart);
        region.x1 = Math.max(region.x1, segment.xEnd);
      }
    }
    return region;
  });

  const tolerance = body.size * 0.6;
  const linesByHeadline = new Map<number, BodyLine[]>();
  const orphanLines: BodyLine[] = [];
  for (const line of bodyLines) {
    const owner = ownerHeadline(line, regions, tolerance);
    if (owner < 0) {
      orphanLines.push(line);
      continue;
    }
    const list = linesByHeadline.get(owner) ?? [];
    list.push(line);
    linesByHeadline.set(owner, list);
  }

  const paragraphs: Paragraph[] = [];
  const articleGroups: ArticleGroup[] = [];
  const warnings: string[] = [];
  let paragraphIndex = 0;

  const makeParagraph = (lines: StyledLine[], text: string, column: number): Paragraph => {
    const x = Math.min(...lines.map((line) => line.x));
    const paragraph: Paragraph = {
      id: `n${column}-p${paragraphIndex}`,
      column,
      text,
      x,
      width: Math.max(...lines.map((line) => line.x + line.width)) - x,
      yTop: Math.min(...lines.map((line) => line.yBaseline)),
      yBottom: Math.max(...lines.map((line) => line.yBaseline)),
      fontSize: median(lines.map((line) => line.fontSize)),
    };
    paragraphIndex += 1;
    paragraphs.push(paragraph);
    return paragraph;
  };

  const toBlock = (paragraph: Paragraph, role: ArticleBlock["role"]): ArticleBlock => ({
    paragraphId: paragraph.id,
    role,
    text: paragraph.text,
    x: paragraph.x,
    y: paragraph.yTop,
    width: paragraph.width,
    fontSize: paragraph.fontSize,
  });

  let skippedHeadlines = 0;
  for (const { headline, index } of headlinesInOrder) {
    const lines = linesByHeadline.get(index) ?? [];
    const runs = orderBodyLines(lines, body.size);
    const built = buildBodyParagraphs(runs, body.size);
    const bodyChars = built.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
    if (bodyChars < MIN_ARTICLE_BODY_CHARS) {
      skippedHeadlines += 1;
      continue;
    }
    const titleText = joinTextLines(headline.lines.map((line) => line.text));
    if (LEGAL_NOTICE_TITLE.test(titleText)) {
      skippedHeadlines += 1;
      continue;
    }
    const column = articleGroups.length;
    const blocks: ArticleBlock[] = [toBlock(makeParagraph(headline.lines, titleText, column), "title")];
    const subtitleLines = subtitles.get(index) ?? [];
    if (subtitleLines.length > 0) {
      blocks.push(toBlock(makeParagraph(subtitleLines, joinTextLines(subtitleLines.map((l) => l.text)), column), "subtitle"));
    }
    for (const paragraph of built) blocks.push(toBlock(makeParagraph(paragraph.lines, paragraph.text, column), "body"));

    const lastBody = built[built.length - 1]?.text.trim() ?? "";
    articleGroups.push({
      column,
      blocks,
      lowConfidenceTitle: false,
      possibleContinuation: lastBody.length > 0 && !/[.!?…"'”’)\]]\s*$/.test(lastBody),
      possibleAdvertisement: false,
    });
  }

  // Corpo sem título acima: entra no catálogo (a auditoria de conservação
  // avisa a possível perda), mas não vira "Matéria importada sem título".
  if (orphanLines.length > 0) {
    const built = buildBodyParagraphs(orderBodyLines(orphanLines, body.size), body.size);
    const orphanChars = built.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
    for (const paragraph of built) makeParagraph(paragraph.lines, paragraph.text, -1);
    if (orphanChars > 0) {
      warnings.push(
        `${areaLabel}: ${orphanChars} caracteres de texto corrido sem título identificável acima (ficaram fora dos rascunhos) — confira no PDF se pertencem a alguma matéria.`,
      );
    }
  }
  if (skippedHeadlines > 0 && articleGroups.length === 0 && bodyItems.length === 0) {
    return emptyLayout("sem texto corrido (só títulos/anúncios)");
  }

  return { columnSegments, paragraphs, articleGroups, warnings };
}

export function layoutNewspaperPage(
  rawItems: TextItem[],
  pageWidth: number,
  pageHeight: number,
  options: NewspaperLayoutOptions,
): NewspaperPageLayout {
  if (options.pageNumber === 1) {
    return emptyLayout("capa (só chamadas para as matérias das páginas internas)");
  }

  const items: StyledItem[] = rawItems
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({ ...item, style: parseFontStyle(item.realFontName) }));

  const headerLimit = pageHeight * HEADER_BAND_RATIO;
  const headerItems = items.filter((item) => item.yBaseline < headerLimit);
  const headerText = headerItems.map((item) => item.text).join(" ");
  if (/publicidade/i.test(headerText)) return emptyLayout("página de publicidade");

  const content = items.filter((item) => item.yBaseline >= headerLimit);
  return layoutArticlesFromItems(content, pageWidth, pageHeight, `Página ${options.pageNumber}`);
}

// ---------------------------------------------------------------------------
// Captura visual de matérias (seleção manual do operador) — reaproveita o
// MESMO motor acima (`layoutArticlesFromItems`), restrito aos itens da área
// marcada; nenhuma heurística nova de título/corpo. Primeira etapa: só
// prévia, nada é gravado (ver PdfVisualCaptureModal.tsx).
// ---------------------------------------------------------------------------

export interface RegionArticleExtraction {
  title: string;
  subtitle: string;
  /** Parágrafos de corpo já na ordem de leitura (colunas detectadas dentro da região). */
  bodyParagraphs: string[];
  /** Verdadeiro quando o operador precisa conferir/completar manualmente (sem título, mais de um título, ou texto sem título reconhecido). */
  needsReview: boolean;
  warnings: string[];
}

const EMPTY_REGION_EXTRACTION: RegionArticleExtraction = {
  title: "",
  subtitle: "",
  bodyParagraphs: [],
  needsReview: true,
  warnings: ["Nenhum texto reconhecido nesta seleção."],
};

/**
 * Extrai título/subtítulo/corpo de UMA área selecionada manualmente pelo
 * operador na captura visual — nunca mistura itens de fora do retângulo
 * (o chamador já filtra `rawItems` pela região antes de chamar esta
 * função). `areaWidth`/`areaHeight` devem ser as dimensões do retângulo em
 * pontos do PDF (não da página inteira), para a detecção de colunas ficar
 * restrita à região.
 */
export function extractArticleFromRegion(
  rawItems: TextItem[],
  areaWidth: number,
  areaHeight: number,
): RegionArticleExtraction {
  const content: StyledItem[] = rawItems
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({ ...item, style: parseFontStyle(item.realFontName) }));
  if (content.length === 0) return EMPTY_REGION_EXTRACTION;

  const layout = layoutArticlesFromItems(content, Math.max(1, areaWidth), Math.max(1, areaHeight), "Seleção");
  const orphanParagraphs = layout.paragraphs.filter((paragraph) => paragraph.column === -1);
  const orphanText = orphanParagraphs
    .sort((a, b) => a.yTop - b.yTop || a.x - b.x)
    .map((paragraph) => paragraph.text);

  if (layout.articleGroups.length === 0) {
    if (orphanText.length === 0) {
      return { ...EMPTY_REGION_EXTRACTION, warnings: ["Nenhum texto reconhecido nesta seleção."] };
    }
    return {
      title: "",
      subtitle: "",
      bodyParagraphs: orphanText,
      needsReview: true,
      warnings: ["Nenhum título reconhecido nesta seleção — confira/preencha o título manualmente."],
    };
  }

  const [primary, ...extra] = layout.articleGroups;
  const title = primary.blocks.find((block) => block.role === "title")?.text ?? "";
  const subtitle = primary.blocks.find((block) => block.role === "subtitle")?.text ?? "";
  const bodyParagraphs = primary.blocks.filter((block) => block.role === "body").map((block) => block.text);
  const warnings: string[] = [];

  // Mais de um título na mesma seleção, ou texto de corpo que o motor não
  // associou a nenhum título: nunca descartado — entra no corpo com aviso,
  // o operador decide (preservar a ordem dos trechos escolhidos).
  for (const group of extra) {
    for (const block of group.blocks) bodyParagraphs.push(block.text);
  }
  if (extra.length > 0) {
    warnings.push(
      `Mais de um título foi reconhecido nesta seleção (${layout.articleGroups.length}) — revise o texto abaixo; o texto das demais partes foi incluído no corpo.`,
    );
  }
  if (orphanText.length > 0) {
    bodyParagraphs.push(...orphanText);
    warnings.push("Parte do texto selecionado não foi associada ao título automaticamente — confira se pertence a esta matéria.");
  }

  return { title, subtitle, bodyParagraphs, needsReview: extra.length > 0 || orphanText.length > 0, warnings };
}
