"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { loadNewsItems, getPublishedNews, type CmsNewsItem } from "../../../components/site/newsStorage";
import { formatDateBR } from "../../../components/site/date";

export default function BuscaPage(): JSX.Element {
  const [items, setItems] = useState<CmsNewsItem[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      const loaded = await loadNewsItems();
      setItems(getPublishedNews(loaded));
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items.filter((item) => `${item.title} ${item.excerpt} ${item.content} ${item.author}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-7">
        <h1 className="font-editorial text-4xl">Busca no Site</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar em todo o site"
          className="mt-4 w-full rounded-lg border border-zinc-300 px-4 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-2 text-sm text-zinc-500">{filtered.length} resultado(s)</p>

        <div className="mt-5 space-y-3">
          {filtered.map((item) => (
            <Link key={item.id} href={`/noticias/${item.slug}`} className="block rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <h3 className="text-xl font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{item.excerpt}</p>
              <p className="mt-2 text-xs text-zinc-500">{item.menuCategory} · {formatDateBR(item.publishedAt)}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

