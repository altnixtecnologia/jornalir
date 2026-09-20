import type { ArticleBlock, ArticleGroup, Paragraph } from "./types";

const TERMINAL_PUNCTUATION = /[.!?…"'”’)\]]\s*$/;

function roundFontSize(size: number): number {
  return Math.round(size * 2) / 2; // agrupa por passos de 0.5pt, tolera ruído de arredondamento
}

/**
 * Tamanho de fonte do corpo: o que acumula mais caracteres na página, não o
 * que aparece em mais parágrafos. Título e subtítulo são curtos por
 * definição; contar por número de parágrafos falharia justamente quando há
 * só uma matéria por página (um título, um subtítulo, um corpo — empate de
 * 1 parágrafo cada). Corpo de texto real sempre soma mais caracteres.
 */
export function computeBodyFontSize(paragraphs: Paragraph[]): number {
  if (paragraphs.length === 0) return 0;
  const charsPerSize = new Map<number, number>();
  for (const paragraph of paragraphs) {
    const key = roundFontSize(paragraph.fontSize);
    charsPerSize.set(key, (charsPerSize.get(key) ?? 0) + paragraph.text.length);
  }
  let mode = paragraphs[0].fontSize;
  let best = -1;
  for (const [size, chars] of charsPerSize) {
    if (chars > best) {
      best = chars;
      mode = size;
    }
  }
  return mode;
}

const SECTION_BREAK_FONT_MULTIPLIER = 3.5;

/**
 * Segmenta os parágrafos de uma coluna em candidatos a matéria, por
 * layout: um parágrafo em fonte maior que o corpo, aparecendo depois de já
 * haver corpo acumulado, inicia uma nova matéria; um vão vertical bem maior
 * que o normal também inicia uma nova matéria mesmo sem mudança de fonte.
 * Não usa o conteúdo do texto para decidir fronteiras.
 *
 * O limiar de "vão grande" é proporcional ao tamanho da fonte do corpo (não
 * a uma mediana dos próprios vãos da coluna): usar estatística dos vãos
 * observados seria circular quando a própria transição entre matérias é uma
 * das poucas amostras disponíveis (ex.: uma página com só duas matérias
 * curtas e nada mais para calibrar um vão "normal").
 */
export function groupParagraphsIntoArticles(
  paragraphs: Paragraph[],
  column: number,
  bodyFontSize: number,
): ArticleGroup[] {
  if (paragraphs.length === 0) return [];

  const sectionBreakThreshold = (bodyFontSize || paragraphs[0].fontSize) * SECTION_BREAK_FONT_MULTIPLIER;

  const groups: Paragraph[][] = [[paragraphs[0]]];
  const gapsBeforeGroup: number[] = [Infinity]; // início da coluna: sem vizinho acima
  for (let i = 1; i < paragraphs.length; i += 1) {
    const current = paragraphs[i];
    const currentGroup = groups[groups.length - 1];
    const hasBodyAlready = currentGroup.some(
      (p) => roundFontSize(p.fontSize) <= roundFontSize(bodyFontSize),
    );
    const isTitleTier = roundFontSize(current.fontSize) > roundFontSize(bodyFontSize);
    const gapBeforeCurrent = current.yTop - paragraphs[i - 1].yBottom;
    const isSectionBreak = gapBeforeCurrent > sectionBreakThreshold;

    if ((isTitleTier && hasBodyAlready) || isSectionBreak) {
      groups.push([current]);
      gapsBeforeGroup.push(gapBeforeCurrent);
    } else {
      currentGroup.push(current);
    }
  }
  const gapsAfterGroup = [...gapsBeforeGroup.slice(1), Infinity]; // fim da coluna: sem vizinho abaixo

  return groups.map((group, index) =>
    classifyArticleGroup(group, column, bodyFontSize, {
      gapBefore: gapsBeforeGroup[index],
      gapAfter: gapsAfterGroup[index],
      isolationThreshold: sectionBreakThreshold,
    }),
  );
}

interface IsolationContext {
  gapBefore: number;
  gapAfter: number;
  isolationThreshold: number;
}

const ADVERTISEMENT_MAX_CHARS = 220;

function classifyArticleGroup(
  group: Paragraph[],
  column: number,
  bodyFontSize: number,
  isolation: IsolationContext,
): ArticleGroup {
  const first = group[0];
  const isFirstTitleTier = roundFontSize(first.fontSize) > roundFontSize(bodyFontSize);

  const blocks: ArticleBlock[] = [];
  let lowConfidenceTitle = false;

  if (isFirstTitleTier) {
    blocks.push(toBlock(first, "title"));
    const rest = group.slice(1);
    const second = rest[0];
    const isSubtitleTier =
      second !== undefined &&
      roundFontSize(second.fontSize) < roundFontSize(first.fontSize) &&
      roundFontSize(second.fontSize) > roundFontSize(bodyFontSize);

    const bodyParagraphs = isSubtitleTier ? rest.slice(1) : rest;
    if (isSubtitleTier) blocks.push(toBlock(second, "subtitle"));
    for (const paragraph of bodyParagraphs) blocks.push(toBlock(paragraph, "body"));
  } else {
    // Sem hierarquia de fonte clara: não adivinha título — mantém tudo como
    // corpo e sinaliza para revisão humana.
    lowConfidenceTitle = true;
    for (const paragraph of group) blocks.push(toBlock(paragraph, "body"));
  }

  const bodyBlocks = blocks.filter((block) => block.role === "body");
  const lastBodyText = bodyBlocks[bodyBlocks.length - 1]?.text ?? blocks[blocks.length - 1]?.text ?? "";
  const possibleContinuation = lastBodyText.trim().length > 0 && !TERMINAL_PUNCTUATION.test(lastBodyText.trim());

  const totalChars = blocks.reduce((sum, block) => sum + block.text.length, 0);
  const isIsolated =
    isolation.gapBefore > isolation.isolationThreshold && isolation.gapAfter > isolation.isolationThreshold;
  const possibleAdvertisement = isIsolated && totalChars > 0 && totalChars <= ADVERTISEMENT_MAX_CHARS;

  return { column, blocks, lowConfidenceTitle, possibleContinuation, possibleAdvertisement };
}

function toBlock(paragraph: Paragraph, role: ArticleBlock["role"]): ArticleBlock {
  return {
    role,
    text: paragraph.text,
    x: paragraph.x,
    y: paragraph.yTop,
    width: paragraph.width,
    fontSize: paragraph.fontSize,
  };
}
