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

export type PageToken = number | "…";

/**
 * Janela de páginas com reticências — sempre mostra a primeira, a última
 * e uma vizinhança (`delta`) ao redor da página atual. `delta` menor no
 * mobile (menos números, mas nunca só anterior/próxima — pedido
 * explícito do usuário).
 */
export function getPageWindow(current: number, total: number, delta: number): PageToken[] {
  if (total <= 1) return [1];
  const pages: number[] = [];
  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    }
  }
  const withDots: PageToken[] = [];
  let last = 0;
  for (const page of pages) {
    if (last) {
      if (page - last === 2) withDots.push(last + 1);
      else if (page - last > 2) withDots.push("…");
    }
    withDots.push(page);
    last = page;
  }
  return withDots;
}
