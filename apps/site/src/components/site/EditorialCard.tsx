import Link from "next/link";
import type { NewsItem } from "@ir/types";
import { formatDateBR } from "./date";

export function EditorialCard({ item, featured = false }: { item: NewsItem; featured?: boolean }): JSX.Element {
  return (
    <Link href={`/noticias/${item.slug}`} className="group block border-b border-zinc-300/70 pb-4 transition hover:border-[color:var(--site-accent)] dark:border-zinc-700">
      <div className={`grid gap-4 ${featured ? "md:grid-cols-[1.2fr_0.8fr]" : "md:grid-cols-[0.9fr_1.1fr]"}`}>
        <div className={`overflow-hidden ${featured ? "h-56 md:h-72" : "h-40 md:h-44"}`}>
          <div className="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.03]" style={{ backgroundImage: `url(${item.imageUrl})` }} />
        </div>
        <div className="flex flex-col justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--site-accent)]">{item.category}</p>
            <h3 className={`mt-2 font-editorial leading-tight ${featured ? "text-3xl" : "text-2xl"}`}>{item.title}</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{item.excerpt}</p>
          </div>
          <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">{formatDateBR(item.publishedAt)} · {item.readMinutes} min</p>
        </div>
      </div>
    </Link>
  );
}
