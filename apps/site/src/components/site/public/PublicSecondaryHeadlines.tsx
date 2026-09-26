import Link from "next/link";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

/**
 * Faixa de destaques (`highlightStrip`, até 3 vagas) — mesmo visual das
 * "Chamadas secundárias" da home mock, adaptado a `PublicArticle` real.
 */
export function PublicSecondaryHeadlines({ items }: { items: PublicArticle[] }): JSX.Element {
  if (items.length === 0) return <></>;
  return (
    <div className="grid grid-cols-1 divide-y divide-[color:var(--site-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <Link key={item.id} href={`/noticias/${item.slug}`} className="group flex gap-3 px-0 py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
          <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-sm">
            {item.cover?.url ? (
              <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${item.cover.url})` }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
                <span className="font-editorial text-xs font-bold text-white/30">IR</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--brand-red)]">{item.sectionName}</p>
            <h4 className="mt-1 text-[15px] font-semibold leading-snug text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)]">
              {item.title}
            </h4>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--site-muted)]">{formatDateBR(item.publishedAt)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
