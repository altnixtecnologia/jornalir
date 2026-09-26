import Link from "next/link";
import { formatDateBR } from "./date";
import { hasPhoto, type SiteArticle } from "./siteArticleTypes";
import { getCategoryLabel } from "./categories";
import { estimateReadingMinutes, readingTimeLabel } from "./readingTime";

/**
 * Card do bloco "Leia também" (Fase 29, item 5) — deliberadamente mais leve
 * que `EditorialCard`: só foto, título, editoria, data e tempo de leitura.
 * Sem subtítulo/resumo, para não competir visualmente com o corpo da
 * matéria que o leitor acabou de terminar.
 */
export function ReadAlsoCard({ item }: { item: SiteArticle }): JSX.Element {
  const withPhoto = hasPhoto(item);
  const minutes = estimateReadingMinutes(item.content);

  return (
    <Link href={`/noticias/${item.slug}`} className="group block">
      <div className="relative h-36 overflow-hidden rounded-sm">
        {withPhoto ? (
          <div
            className="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${item.imageUrl})` }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
            <span className="font-editorial text-xl font-bold text-white/25">IR</span>
          </div>
        )}
      </div>
      <p className="kicker mt-3">{getCategoryLabel(item.category)}</p>
      <h3 className="mt-1 font-editorial text-base font-bold leading-tight text-[color:var(--site-text)] transition group-hover:text-[color:var(--brand-red)]">
        {item.title}
      </h3>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--site-muted)]">
        {formatDateBR(item.publishedAt)} · {readingTimeLabel(minutes)}
      </p>
    </Link>
  );
}
