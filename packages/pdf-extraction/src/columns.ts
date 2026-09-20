import type { TextItem } from "./types";

/**
 * Detecta colunas por vãos de tinta (nenhum texto cobre aquela faixa de x em
 * nenhuma altura da página) — técnica determinística de análise de layout,
 * não baseada no conteúdo do texto. Retorna os intervalos [xStart, xEnd) de
 * cada coluna, da esquerda para a direita.
 */
export function detectColumns(items: TextItem[], pageWidth: number): Array<[number, number]> {
  if (items.length === 0) return [[0, pageWidth]];

  const resolution = 2; // pontos por bucket
  const bucketCount = Math.max(1, Math.ceil(pageWidth / resolution));
  const coverage = new Array<number>(bucketCount).fill(0);

  for (const item of items) {
    const startBucket = Math.max(0, Math.floor(item.x / resolution));
    const endBucket = Math.min(bucketCount, Math.ceil((item.x + item.width) / resolution));
    for (let b = startBucket; b < endBucket; b += 1) {
      coverage[b] += 1;
    }
  }

  const firstInk = coverage.findIndex((value) => value > 0);
  const lastInkFromEnd = [...coverage].reverse().findIndex((value) => value > 0);
  if (firstInk === -1) return [[0, pageWidth]];
  const lastInk = bucketCount - 1 - lastInkFromEnd;

  const contentStart = firstInk * resolution;
  const contentEnd = (lastInk + 1) * resolution;

  const minGapPt = 20;
  const minGapBuckets = Math.ceil(minGapPt / resolution);

  const gaps: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let b = firstInk; b <= lastInk; b += 1) {
    if (coverage[b] === 0) {
      if (runStart === null) runStart = b;
    } else if (runStart !== null) {
      if (b - runStart >= minGapBuckets) gaps.push([runStart * resolution, b * resolution]);
      runStart = null;
    }
  }

  const boundaries = [contentStart, ...gaps.flat(), contentEnd];
  const columns: Array<[number, number]> = [];
  for (let i = 0; i < boundaries.length; i += 2) {
    columns.push([boundaries[i], boundaries[i + 1]]);
  }
  return columns.length > 0 ? columns : [[contentStart, contentEnd]];
}

export function assignColumn(item: TextItem, columnRanges: Array<[number, number]>): number {
  const center = item.x + item.width / 2;
  for (let i = 0; i < columnRanges.length; i += 1) {
    const [start, end] = columnRanges[i];
    if (center >= start && center <= end) return i;
  }
  // Fallback: item fora de qualquer vão detectado (ex.: título centralizado
  // no topo da página) — atribui à coluna mais próxima em vez de descartar.
  let closest = 0;
  let closestDistance = Infinity;
  columnRanges.forEach(([start, end], index) => {
    const mid = (start + end) / 2;
    const distance = Math.abs(center - mid);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = index;
    }
  });
  return closest;
}
