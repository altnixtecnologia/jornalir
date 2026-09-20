"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategorySlug } from "@ir/types";
import { SiteHeader } from "./SiteHeader";
import { loadNewsItems, getPublishedNews, type CmsNewsItem } from "./newsStorage";
import { EditorialCard } from "./EditorialCard";
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

  const [lead, ...rest] = filtered;

  return (
    <main className="min-h-screen">
      <SiteHeader active={category} />
      <section className="site-shell py-8">
        <p className="text-xs text-[color:var(--site-muted)]">Informativo Regional &gt; {getCategoryLabel(category)}</p>
        <h1 className="mt-2 font-editorial text-[36px] font-bold leading-tight md:text-[44px]">{getCategoryLabel(category)}</h1>

        <div className="mt-6 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Filtrar por texto"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            className="rounded-sm border border-[color:var(--site-line)] bg-[color:var(--site-surface)] px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-sm border border-[color:var(--site-line)] bg-[color:var(--site-surface)] px-3 py-2 text-sm"
          />
          {textFilter || dateFilter ? (
            <button
              type="button"
              onClick={() => {
                setTextFilter("");
                setDateFilter("");
              }}
              className="nav-pill"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>

        <hr className="divider mt-6" />
        <p className="mb-6 mt-4 text-xs uppercase tracking-wide text-[color:var(--site-muted)]">{filtered.length} resultado(s)</p>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-64 animate-pulse rounded-sm bg-[color:var(--site-surface)]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-sm border border-dashed border-[color:var(--site-line)] p-10 text-center">
            <h2 className="font-editorial text-xl font-bold">Nenhum resultado encontrado</h2>
            <p className="mt-2 text-sm text-[color:var(--site-muted)]">Tente ajustar ou limpar os filtros para ver mais matérias.</p>
          </div>
        ) : (
          <div className="space-y-10">
            <EditorialCard item={lead} featured />
            {rest.length > 0 ? (
              <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2">
                {rest.map((item) => (
                  <EditorialCard key={item.id} item={item} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
