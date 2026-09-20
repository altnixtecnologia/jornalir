import type { Line, TextItem } from "./types";

/**
 * Agrupa itens (já pertencentes a uma única coluna) em linhas, por
 * proximidade vertical. Dentro de uma linha, concatena por posição em x sem
 * inventar nem descartar caracteres: junta com espaço apenas quando há um
 * vão horizontal real entre itens.
 */
export function groupItemsIntoLines(items: TextItem[]): Line[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.yBaseline - b.yBaseline || a.x - b.x);

  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const referenceFontSize = lastRow[0].fontSize;
      const tolerance = Math.max(1, referenceFontSize * 0.35);
      if (Math.abs(item.yBaseline - lastRow[0].yBaseline) <= tolerance) {
        lastRow.push(item);
        continue;
      }
    }
    rows.push([item]);
  }

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.x - b.x);
    let text = "";
    let previous: TextItem | null = null;
    for (const item of ordered) {
      if (previous) {
        const gap = item.x - (previous.x + previous.width);
        if (gap > previous.fontSize * 0.15 && !text.endsWith(" ") && item.text.length > 0) {
          text += " ";
        }
      }
      text += item.text;
      previous = item;
    }
    const x = Math.min(...ordered.map((item) => item.x));
    const width = Math.max(...ordered.map((item) => item.x + item.width)) - x;
    const yBaseline = ordered[0].yBaseline;
    const fontSize = Math.max(...ordered.map((item) => item.fontSize));
    return { text, x, width, yBaseline, fontSize };
  });
}
