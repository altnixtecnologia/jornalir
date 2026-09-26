import Link from "next/link";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";
import { estimateReadingMinutes, readingTimeLabel } from "../readingTime";

/**
 * `ReadAlsoCard` (Fase 29) adaptado a `PublicArticle` real — mesmo visual
 * deliberadamente leve (só foto/título/editoria/data/tempo de leitura,
 * sem subtítulo/resumo).
 */
export function PublicReadAlsoCard({ item }: { item: PublicArticle }): JSX.Element {
  const minutes = estimateReadingMinutes(item.body);

  return (
    <Link href={`/noticias/${item.slug}`} className="group block">
      <div className="relative h-36 overflow-hidden rounded-sm">
        {item.cover?.url ? (
          <div
            className="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${item.cover.url})` }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
            <span className="font-editorial text-xl font-bold text-white/25">IR</span>
          </div>
        )}
      </div>
      <p className="kicker mt-3">{item.sectionName}</p>
      <h3 className="mt-1 font-editorial text-base font-bold leading-tight text-[color:var(--site-text)] transition group-hover:text-[color:var(--brand-red)]">
        {item.title}
      </h3>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--site-muted)]">
        {formatDateBR(item.publishedAt)} · {readingTimeLabel(minutes)}
      </p>
    </Link>
  );
}
