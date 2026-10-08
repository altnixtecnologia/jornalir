"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DEFAULT_PAGE_SIZE, clampJumpPage, getPageBlock } from "../../../lib/public/pagination";

/**
 * Navegação por blocos de 10 páginas (Fase 49, item 7 — substitui a
 * numeração com reticências): anterior/próxima, bloco anterior/próximo
 * («/») quando existir, até 10 números do bloco atual, e um campo "Ir
 * para página" para saltar direto (ex.: 200). `page`/`pageSize` vivem na
 * própria URL — preserva filtros/busca porque `basePath` já inclui tudo
 * que precisa (quem chama monta `basePath` com os filtros atuais).
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
  const router = useRouter();
  const [jumpValue, setJumpValue] = useState("");

  if (totalPages <= 1) return null;

  const hrefFor = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const { pages, hasPrevBlock, hasNextBlock, prevBlockPage, nextBlockPage } = getPageBlock(currentPage, totalPages, 10);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  function handleJump(event: FormEvent): void {
    event.preventDefault();
    const target = clampJumpPage(jumpValue, totalPages);
    if (target === null) return;
    router.push(hrefFor(target));
    setJumpValue("");
  }

  return (
    <nav className="mt-10 border-t border-[color:var(--site-line)] pt-6" aria-label="Paginação">
      <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
        <PageLink href={hrefFor(currentPage - 1)} disabled={!hasPrev} ariaLabel="Página anterior">
          ‹
        </PageLink>
        {hasPrevBlock ? (
          <PageLink href={hrefFor(prevBlockPage)} ariaLabel="Bloco de páginas anterior">
            «
          </PageLink>
        ) : null}

        <div className="flex items-center gap-1">
          {pages.map((page) => (
            <PageLink key={page} href={hrefFor(page)} active={page === currentPage}>
              {page}
            </PageLink>
          ))}
        </div>

        {hasNextBlock ? (
          <PageLink href={hrefFor(nextBlockPage)} ariaLabel="Próximo bloco de páginas">
            »
          </PageLink>
        ) : null}
        <PageLink href={hrefFor(currentPage + 1)} disabled={!hasNext} ariaLabel="Próxima página">
          ›
        </PageLink>
      </div>

      <form onSubmit={handleJump} className="mt-4 flex items-center justify-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[color:var(--site-muted)]">
          Ir para página
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            placeholder={String(currentPage)}
            className="w-16 rounded-full border border-[color:var(--site-line)] bg-[color:var(--site-surface)] px-2 py-1 text-center text-sm text-[color:var(--site-text)]"
            aria-label="Número da página"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-[color:var(--brand-red)] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90"
        >
          Ir
        </button>
      </form>
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
  const base = "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-navy)]";
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
          : "text-[color:var(--site-text)] hover:bg-[color:var(--site-line)]/40"
      }`}
    >
      {children}
    </Link>
  );
}
