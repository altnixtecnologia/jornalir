/**
 * UX de paginação do portal (Fase 39, decisão do usuário registrada em
 * docs/CHATGPT_REVIEW.md): 24/48/96 por página, páginas numeradas com
 * reticências quando há muitas. Lógica pura, compartilhada entre as
 * listagens server-rendered (`/noticias`, `/editoria/[slug]`) e a busca
 * (client component com estado próprio).
 */
export const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 24;

export function parsePageSize(raw: string | null | undefined): PageSize {
  const n = Number.parseInt(raw ?? "", 10);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE;
}

export function parsePage(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export interface PageBlock {
  pages: number[];
  blockStart: number;
  blockEnd: number;
  hasPrevBlock: boolean;
  hasNextBlock: boolean;
  prevBlockPage: number;
  nextBlockPage: number;
}

/**
 * Paginação por blocos de 10 (Fase 49, item 7 — substitui a janela com
 * reticências anterior): 1–10, depois 11–20, 21–30 etc., de acordo com a
 * página atual. `prevBlockPage`/`nextBlockPage` levam para a última
 * página do bloco anterior / primeira do próximo bloco — nunca pulam
 * direto para o início/fim do total.
 */
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
