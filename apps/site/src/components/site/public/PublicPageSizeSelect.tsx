import Link from "next/link";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from "../../../lib/public/pagination";

/**
 * Seletor 24/48/96 (Fase 39, ajuste da revisão do ChatGPT) — vive no
 * CABEÇALHO da listagem, do lado oposto ao título/contador, separado da
 * navegação numerada (que fica no rodapé, em `PublicPagination`). Trocar
 * o tamanho sempre volta para a página 1 (nunca inclui `page=` no link).
 */
export function PublicPageSizeSelect({ pageSize, basePath }: { pageSize: number; basePath: string }): JSX.Element {
  const hrefFor = (size: number) => (size === DEFAULT_PAGE_SIZE ? basePath : `${basePath}?pageSize=${size}`);

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="text-[color:var(--site-muted)]">Por página:</span>
      <div className="inline-flex overflow-hidden rounded-full border border-[color:var(--site-border)]">
        {PAGE_SIZE_OPTIONS.map((size) => (
          <Link
            key={size}
            href={hrefFor(size)}
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
  );
}
