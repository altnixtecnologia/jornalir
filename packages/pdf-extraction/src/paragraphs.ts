import type { Line, Paragraph } from "./types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function roundFontSize(size: number): number {
  return Math.round(size * 2) / 2;
}

/**
 * Agrupa linhas (já ordenadas de cima para baixo, dentro de uma coluna) em
 * parágrafos. Duas linhas só ficam no mesmo parágrafo quando têm o mesmo
 * tamanho de fonte (título, subtítulo e corpo nunca se misturam por
 * definição) E o vão vertical entre elas não é maior que o "normal" da
 * coluna. Junta linhas de um mesmo parágrafo com espaço simples (quebra de
 * linha dentro da mesma frase).
 */
export function groupLinesIntoParagraphs(lines: Line[]): Paragraph[] {
  if (lines.length === 0) return [];
  if (lines.length === 1) {
    const [line] = lines;
    return [
      {
        text: line.text,
        x: line.x,
        width: line.width,
        yTop: line.yBaseline,
        yBottom: line.yBaseline,
        fontSize: line.fontSize,
      },
    ];
  }

  // A mediana de vão "normal" só considera pares de linhas com o mesmo
  // tamanho de fonte — um vão entre título e corpo (tamanhos diferentes) já
  // quebra por mudança de fonte de qualquer forma, e misturá-lo na
  // estatística distorceria o limiar para os vãos que realmente importam
  // (parágrafo vs. quebra de linha dentro do mesmo texto).
  const sameFontGaps: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (roundFontSize(lines[i].fontSize) === roundFontSize(lines[i - 1].fontSize)) {
      sameFontGaps.push(lines[i].yBaseline - lines[i - 1].yBaseline);
    }
  }
  const normalGap = median(sameFontGaps.filter((gap) => gap > 0)) || 1;
  const paragraphBreakThreshold = normalGap * 1.6;

  const groups: Line[][] = [[lines[0]]];
  for (let i = 1; i < lines.length; i += 1) {
    const gap = lines[i].yBaseline - lines[i - 1].yBaseline;
    const fontChanged = roundFontSize(lines[i].fontSize) !== roundFontSize(lines[i - 1].fontSize);
    if (fontChanged || gap > paragraphBreakThreshold) {
      groups.push([lines[i]]);
    } else {
      groups[groups.length - 1].push(lines[i]);
    }
  }

  return groups.map((group) => {
    const x = Math.min(...group.map((line) => line.x));
    const width = Math.max(...group.map((line) => line.x + line.width)) - x;
    return {
      text: group.map((line) => line.text).join(" "),
      x,
      width,
      yTop: group[0].yBaseline,
      yBottom: group[group.length - 1].yBaseline,
      fontSize: Math.max(...group.map((line) => line.fontSize)),
    };
  });
}
