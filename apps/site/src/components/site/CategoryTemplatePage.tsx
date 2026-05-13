"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategorySlug } from "@ir/types";
import { SiteHeader } from "./SiteHeader";
import { loadNewsItems, getPublishedNews, type CmsNewsItem } from "./newsStorage";
import { EditorialCard } from "./EditorialCard";
import { formatDateBR } from "./date";
import { getCategoryLabel } from "./categories";

export function CategoryTemplatePage({ category }: { category: CategorySlug }): JSX.Element {
  const [items, setItems] = useState<CmsNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [textFilter, setTextFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    void (async () => {
      const loaded = await loadNewsItems();
      setItems(getPublishedNews(loaded));
      setIsLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (item.menuCategory !== category && item.category !== category) return false;
      if (dateFilter) {
        const d = item.publishedAt.slice(0, 10);
        if (d !== dateFilter) return false;
      }
      if (textFilter) {
        const q = textFilter.toLowerCase();
        const hay = `${item.title} ${item.excerpt} ${item.content}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, category, dateFilter, textFilter]);

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-7">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Informativo Regional &gt; {getCategoryLabel(category)}</p>
          <h1 className="mt-3 font-editorial text-4xl">{getCategoryLabel(category).toUpperCase()}</h1>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Filtrar por texto"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={() => {
              setTextFilter("");
              setDateFilter("");
            }}
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            Limpar filtros
          </button>
        </div>

        <p className="mt-4 text-sm text-zinc-500">{filtered.length} resultado(s)</p>

        {isLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-64 animate-pulse rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Nenhum resultado encontrado</h2>
            <p className="mt-2 text-sm text-zinc-500">Tente ajustar ou limpar os filtros para ver mais matérias.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {filtered.map((item) => (
              <article key={item.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <EditorialCard item={item} />
                <p className="mt-2 text-xs text-zinc-500">{formatDateBR(item.publishedAt)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
