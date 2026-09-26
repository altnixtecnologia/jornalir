import Link from "next/link";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, getPageWindow } from "../../../lib/public/pagination";

/**
 * Paginação server-side real (Fase 39 — corrige o teto artificial de
 * 40/60/200 matérias nas listagens do portal), com a UX pedida pelo
 * usuário: páginas numeradas com reticências (nunca só anterior/
 * próxima) e seletor de quantidade por página (24/48/96). Tudo via
 * `<Link>` — nenhum JavaScript de cliente necessário aqui, `page`/
 * `pageSize` vivem na própria URL (voltar/avançar do navegador e
 * compartilhar o link funcionam).
 */
export function PublicPagination({
  currentPage,
  totalPages,
  pageSize,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  basePath: string;
}): JSX.Element | null {
  if (totalPages <= 1 && pageSize === DEFAULT_PAGE_SIZE) return null;

  const hrefFor = (page: number, size: number = pageSize) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (size !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(size));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav className="mt-10 flex flex-col gap-4 border-t border-[color:var(--site-border)] pt-6" aria-label="Paginação">
      <div className="flex items-center justify-end gap-1 text-xs">
        <span className="mr-1 text-[color:var(--site-muted)]">Por página:</span>
        <div className="inline-flex overflow-hidden rounded-full border border-[color:var(--site-border)]">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <Link
              key={size}
              href={hrefFor(1, size)}
              className={`px-3 py-1 font-semibold transition ${
                size === pageSize
                  ? "bg-[color:var(--brand-red)] text-white"
                  : "text-[color:var(--site-muted)] hover:bg-[color:var(--site-border)]/40"
              }`}
              aria-current={size === pageSize ? "true" : undefined}
            >
              {size}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 sm:gap-1.5">
        <PageLink href={hrefFor(currentPage - 1)} disabled={!hasPrev} ariaLabel="Página anterior">
          ‹
        </PageLink>

        {/* Desktop: janela maior ao redor da página atual. */}
        <div className="hidden items-center gap-1 sm:flex">
          {getPageWindow(currentPage, totalPages, 2).map((token, i) =>
            token === "…" ? (
              <span key={`dots-${i}`} className="px-2 text-[color:var(--site-muted)]">
                …
              </span>
            ) : (
              <PageLink key={token} href={hrefFor(token)} active={token === currentPage}>
                {token}
              </PageLink>
            ),
          )}
        </div>

        {/* Mobile: janela mais compacta, mas ainda numerada (nunca só anterior/próxima). */}
        <div className="flex items-center gap-1 sm:hidden">
          {getPageWindow(currentPage, totalPages, 1).map((token, i) =>
            token === "…" ? (
              <span key={`dots-m-${i}`} className="px-1.5 text-[color:var(--site-muted)]">
                …
              </span>
            ) : (
              <PageLink key={token} href={hrefFor(token)} active={token === currentPage}>
                {token}
              </PageLink>
            ),
          )}
        </div>

        <PageLink href={hrefFor(currentPage + 1)} disabled={!hasNext} ariaLabel="Próxima página">
          ›
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  active,
  disabled,
  ariaLabel,
  children,
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}): JSX.Element {
  const base = "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold transition";
  if (disabled) {
    return (
      <span className={`${base} cursor-not-allowed text-[color:var(--site-muted)]/40`} aria-hidden="true">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`${base} ${
        active
          ? "bg-[color:var(--brand-red)] text-white"
          : "text-[color:var(--site-text)] hover:bg-[color:var(--site-border)]/40"
      }`}
    >
      {children}
    </Link>
  );
}
