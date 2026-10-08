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
      <span id="page-size-label" className="text-[color:var(--site-muted)]">
        Por página:
      </span>
      {/* `role="group"` + `aria-labelledby` (3B.5/3C.2): o texto "Por
          página" é só visual, sem isto nada liga essa label aos links —
          leitor de tela ouviria "24, 48, 96" sem contexto. */}
      <div role="group" aria-labelledby="page-size-label" className="inline-flex overflow-hidden rounded-full border border-[color:var(--site-line)]">
        {PAGE_SIZE_OPTIONS.map((size) => (
          <Link
            key={size}
            href={hrefFor(size)}
            className={`px-3 py-1 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-navy)] ${
              size === pageSize
                ? "bg-[color:var(--brand-red)] text-white"
                : "text-[color:var(--site-muted)] hover:bg-[color:var(--site-line)]/40"
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
