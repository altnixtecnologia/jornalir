import type { NewsItem } from "@ir/types";

export function NewsCard({ item }: { item: NewsItem }): JSX.Element {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{item.category}</p>
      <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{item.excerpt}</p>
    </article>
  );
}
