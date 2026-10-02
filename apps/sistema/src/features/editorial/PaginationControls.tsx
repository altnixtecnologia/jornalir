"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { clampJumpPage, getPageBlock } from "../../lib/pagination";

/**
 * Paginação por blocos de 10 + "Ir para página" (Fase 49, item 7) —
 * componente único reaproveitado por toda listagem paginada do sistema
 * (matérias, mídias). `buildHref` já deve preservar os filtros/busca
 * atuais (quem chama monta a URL completa, este componente só troca o
 * número da página).
 */
export function PaginationControls({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (targetPage: number) => string;
}): JSX.Element | null {
  const router = useRouter();
  const [jumpValue, setJumpValue] = useState("");

  if (totalPages <= 1) return null;

  const { pages, hasPrevBlock, hasNextBlock, prevBlockPage, nextBlockPage } = getPageBlock(page, totalPages, 10);

  function handleJump(event: FormEvent): void {
    event.preventDefault();
    const target = clampJumpPage(jumpValue, totalPages);
    if (target === null) return;
    router.push(buildHref(target));
    setJumpValue("");
  }

  return (
    <nav className="pagination-controls" aria-label="Paginação">
      <div className="pagination-controls-numbers">
        {page > 1 ? (
          <Link className="pagination-page-link" href={buildHref(page - 1)} aria-label="Página anterior">
            ‹
          </Link>
        ) : (
          <span className="pagination-page-link is-disabled" aria-hidden="true">‹</span>
        )}
        {hasPrevBlock ? (
          <Link className="pagination-page-link" href={buildHref(prevBlockPage)} aria-label="Bloco de páginas anterior">
            «
          </Link>
        ) : null}
        {pages.map((p) => (
          <Link
            key={p}
            className={`pagination-page-link${p === page ? " is-active" : ""}`}
            href={buildHref(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Link>
        ))}
        {hasNextBlock ? (
          <Link className="pagination-page-link" href={buildHref(nextBlockPage)} aria-label="Próximo bloco de páginas">
            »
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link className="pagination-page-link" href={buildHref(page + 1)} aria-label="Próxima página">
            ›
          </Link>
        ) : (
          <span className="pagination-page-link is-disabled" aria-hidden="true">›</span>
        )}
      </div>
      <form onSubmit={handleJump} className="pagination-jump">
        <label>
          Ir para página
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            placeholder={String(page)}
            aria-label="Número da página"
          />
        </label>
        <button type="submit">Ir</button>
      </form>
    </nav>
  );
}
