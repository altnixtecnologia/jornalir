import type { ColumnSegment, TextItem } from "./types";

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

/**
 * Altura de banda usada para amostrar a estrutura de colunas ao longo da
 * página — grossa o bastante para cobrir várias linhas de cada coluna
 * (essencial: com poucas linhas por banda, a borda externa de texto
 * alinhado à esquerda "capenga" de linha a linha, e a banda mediria ruído
 * de conteúdo em vez de estrutura de layout), fina o bastante para capturar
 * uma mudança real de estrutura (ex.: onde uma coluna estreita lateral
 * começa ou termina) — uma caixa de horóscopo ocupa dezenas de linhas, não
 * poucas, então esta resolução já é suficiente para localizá-la.
 */
const REGION_BAND_HEIGHT_PT = 70;

/** Duas bandas são consideradas a mesma estrutura de colunas quando cada fronteira entre colunas bate dentro desta tolerância (ruído de posicionamento, não mudança de layout). */
const COLUMN_BOUNDARY_TOLERANCE_PT = 24;

/**
 * O que importa para "é a mesma estrutura de colunas" é onde ficam os vãos
 * *entre* colunas — não a borda externa (esquerda da primeira, direita da
 * última), que varia naturalmente com o texto alinhado à esquerda/direita
 * (título mais curto que corpo, última linha de um parágrafo, etc.) mesmo
 * dentro da mesma coluna real. Comparar bordas externas geraria fragmentação
 * artificial; comparar só as fronteiras internas é robusto a isso.
 */
function columnBoundaries(ranges: Array<[number, number]>): number[] {
  const boundaries: number[] = [];
  for (let i = 0; i < ranges.length - 1; i += 1) {
    boundaries.push((ranges[i][1] + ranges[i + 1][0]) / 2);
  }
  return boundaries;
}

function sameColumnStructure(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  if (a.length !== b.length) return false;
  const boundariesA = columnBoundaries(a);
  const boundariesB = columnBoundaries(b);
  return boundariesA.every(
    (boundary, index) => Math.abs(boundary - boundariesB[index]) <= COLUMN_BOUNDARY_TOLERANCE_PT,
  );
}

/**
 * Detecta colunas por região vertical da página (Fase 11): amostra a
 * estrutura de colunas (via `detectColumns`, técnica de vãos de tinta) em
 * bandas horizontais sucessivas, funde bandas adjacentes com a mesma
 * estrutura em uma única região, e devolve a lista completa de segmentos
 * (região × coluna), cobrindo toda a altura da página. Uma página com
 * estrutura uniforme do topo à base colapsa em uma única região — o mesmo
 * resultado que `detectColumns` sozinho já dava antes desta fase. Continua
 * sendo análise de layout (posição de tinta), nunca de conteúdo do texto.
 */
export function detectColumnSegments(
  items: TextItem[],
  pageWidth: number,
  pageHeight: number,
): ColumnSegment[] {
  if (items.length === 0) return [{ yTop: 0, yBottom: pageHeight, xStart: 0, xEnd: pageWidth }];

  const contentTop = Math.min(...items.map((item) => item.yBaseline - item.fontSize));
  const contentBottom = Math.max(...items.map((item) => item.yBaseline));

  interface RawBand {
    yTop: number;
    yBottom: number;
    columnRanges: Array<[number, number]>;
  }

  const rawBands: RawBand[] = [];
  let cursor = contentTop;
  while (cursor < contentBottom) {
    const bandTop = cursor;
    const bandBottom = Math.min(contentBottom, cursor + REGION_BAND_HEIGHT_PT);
    cursor = bandBottom;
    const bandItems = items.filter((item) => item.yBaseline >= bandTop && item.yBaseline < bandBottom + 0.01);
    if (bandItems.length === 0) continue;
    rawBands.push({ yTop: bandTop, yBottom: bandBottom, columnRanges: detectColumns(bandItems, pageWidth) });
  }

  if (rawBands.length === 0) return [{ yTop: 0, yBottom: pageHeight, xStart: 0, xEnd: pageWidth }];

  const regions: RawBand[] = [];
  for (const band of rawBands) {
    const last = regions[regions.length - 1];
    if (last && sameColumnStructure(last.columnRanges, band.columnRanges)) {
      last.yBottom = band.yBottom;
    } else {
      regions.push({ ...band });
    }
  }

  // Estende a primeira/última região até as bordas da página e fecha
  // qualquer vão entre regiões (inclusive bandas vazias puladas) no meio do
  // caminho — todo item da página precisa cair em exatamente uma região.
  regions[0].yTop = 0;
  regions[regions.length - 1].yBottom = pageHeight;
  for (let i = 1; i < regions.length; i += 1) {
    const boundary = (regions[i - 1].yBottom + regions[i].yTop) / 2;
    regions[i - 1].yBottom = boundary;
    regions[i].yTop = boundary;
  }

  return regions.flatMap((region) =>
    region.columnRanges.map(([xStart, xEnd]) => ({ yTop: region.yTop, yBottom: region.yBottom, xStart, xEnd })),
  );
}

/** Atribui um item ao segmento (região × coluna) cujo intervalo vertical o contém e cujo intervalo horizontal é mais próximo do centro do item. */
export function assignSegment(item: TextItem, segments: ColumnSegment[]): number {
  const withIndex = segments.map((segment, index) => ({ segment, index }));
  const inBand = withIndex.filter(
    ({ segment }) => item.yBaseline >= segment.yTop && item.yBaseline < segment.yBottom + 0.01,
  );
  const pool = inBand.length > 0 ? inBand : withIndex;

  const center = item.x + item.width / 2;
  let best = pool[0];
  let bestDistance = Infinity;
  for (const candidate of pool) {
    const { xStart, xEnd } = candidate.segment;
    const distance = center < xStart ? xStart - center : center > xEnd ? center - xEnd : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best.index;
}
