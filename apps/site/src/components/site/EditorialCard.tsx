import Link from "next/link";
import { formatDateBR } from "./date";
import { galleryCount, hasPhoto, type SiteArticle } from "./siteArticleTypes";
import { getCategoryLabel } from "./categories";

export function EditorialCard({ item, featured = false }: { item: SiteArticle; featured?: boolean }): JSX.Element {
  const withPhoto = hasPhoto(item);
  const extraPhotos = galleryCount(item);

  return (
    <Link href={`/noticias/${item.slug}`} className="group block">
      <div className={`grid items-start gap-4 ${featured ? "md:grid-cols-[1.2fr_0.8fr]" : "md:grid-cols-[0.9fr_1.1fr]"}`}>
        <div className={`relative overflow-hidden rounded-sm ${featured ? "h-56 md:h-72" : "h-40 md:h-44"}`}>
          {withPhoto ? (
            <div
              className="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
              style={{ backgroundImage: `url(${item.imageUrl})` }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
              <span className="font-editorial text-2xl font-bold text-white/25">IR</span>
            </div>
          )}
          {extraPhotos > 0 ? (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
              ⛶ {extraPhotos + 1}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col justify-between">
          <div>
            <p className="kicker">{getCategoryLabel(item.category)}</p>
            <h3 className={`mt-2 font-editorial font-bold leading-tight text-[color:var(--site-text)] transition group-hover:text-[color:var(--brand-red)] ${featured ? "text-2xl md:text-3xl" : "text-xl"}`}>
              {item.title}
            </h3>
            <p className="mt-2 text-sm text-[color:var(--site-muted)]">{item.excerpt}</p>
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--site-muted)]">
            {formatDateBR(item.publishedAt)} · {item.readMinutes} min{item.locality ? ` · ${item.locality}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}
