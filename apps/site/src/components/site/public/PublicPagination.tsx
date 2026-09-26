import Link from "next/link";
import { DEFAULT_PAGE_SIZE, getPageWindow } from "../../../lib/public/pagination";

/**
 * Navegação numerada do RODAPÉ da listagem (Fase 39, ajuste da revisão do
 * ChatGPT: o seletor 24/48/96 foi separado para `PublicPageSizeSelect`,
 * que vive no cabeçalho — este componente cuida só de anterior/páginas/
 * próxima). Páginas numeradas com reticências (nunca só anterior/
 * próxima), via `<Link>` — `page`/`pageSize` vivem na própria URL
 * (voltar/avançar do navegador e compartilhar o link funcionam).
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
  if (totalPages <= 1) return null;

  const hrefFor = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav className="mt-10 border-t border-[color:var(--site-border)] pt-6" aria-label="Paginação">
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
