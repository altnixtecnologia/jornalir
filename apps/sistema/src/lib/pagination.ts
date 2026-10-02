/**
 * Paginação por blocos de 10 (Fase 49, item 7) — mesma lógica usada em
 * `apps/site` (`lib/public/pagination.ts`), reimplementada aqui em vez de
 * compartilhada via pacote: os dois apps não compartilham nenhum
 * componente visual de paginação hoje (estilos/CSS completamente
 * diferentes) e o algoritmo em si é pequeno o bastante para não justificar
 * uma dependência cruzada só por isto.
 */
export interface PageBlock {
  pages: number[];
  blockStart: number;
  blockEnd: number;
  hasPrevBlock: boolean;
  hasNextBlock: boolean;
  prevBlockPage: number;
  nextBlockPage: number;
}

export function getPageBlock(current: number, total: number, blockSize = 10): PageBlock {
  const safeTotal = Math.max(1, total);
  const blockIndex = Math.floor((current - 1) / blockSize);
  const blockStart = blockIndex * blockSize + 1;
  const blockEnd = Math.min(blockStart + blockSize - 1, safeTotal);
  const pages: number[] = [];
  for (let p = blockStart; p <= blockEnd; p += 1) pages.push(p);
  return {
    pages,
    blockStart,
    blockEnd,
    hasPrevBlock: blockStart > 1,
    hasNextBlock: blockEnd < safeTotal,
    prevBlockPage: Math.max(1, blockStart - 1),
    nextBlockPage: Math.min(safeTotal, blockEnd + 1),
  };
}

/** Clampa e normaliza o valor digitado em "Ir para página" — nunca fora de 1..total. */
export function clampJumpPage(raw: string, total: number): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(1, n), Math.max(1, total));
}
