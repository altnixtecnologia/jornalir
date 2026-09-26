import Link from "next/link";

/**
 * Paginação server-side real (Fase 39 — corrige o teto artificial de
 * 40/60/200 matérias nas listagens do portal). `basePath` já vem sem
 * querystring; `page=1` nunca aparece na URL (link "limpo" para a
 * primeira página).
 */
export function PublicPagination({
  currentPage,
  totalPages,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
}): JSX.Element | null {
  if (totalPages <= 1) return null;

  const hrefFor = (page: number) => (page <= 1 ? basePath : `${basePath}?page=${page}`);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav className="mt-10 flex items-center justify-between border-t border-[color:var(--site-border)] pt-6" aria-label="Paginação">
      {hasPrev ? (
        <Link href={hrefFor(currentPage - 1)} className="text-sm font-semibold text-[color:var(--brand-red)] hover:underline">
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-[color:var(--site-muted)]">
        Página {currentPage} de {totalPages}
      </span>
      {hasNext ? (
        <Link href={hrefFor(currentPage + 1)} className="text-sm font-semibold text-[color:var(--brand-red)] hover:underline">
          Próxima →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
