"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { expandedNewsData, sponsoredSlots } from "../../../../components/site/content";
import { formatDateBR } from "../../../../components/site/date";
import { EditorialCard } from "../../../../components/site/EditorialCard";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { getPublishedNews, loadNewsItems, type CmsNewsItem } from "../../../../components/site/newsStorage";

export default function NoticiaDetalhePage(): JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [items, setItems] = useState<CmsNewsItem[]>(expandedNewsData as CmsNewsItem[]);

  useEffect(() => {
    void (async () => {
      const loaded = await loadNewsItems();
      setItems(getPublishedNews(loaded));
    })();
  }, []);

  const current = useMemo(() => items.find((item) => item.slug === slug), [items, slug]);
  if (!current) {
    return (
      <main className="min-h-screen">
        <SiteHeader active="noticias" />
        <section className="site-shell py-8">
          <h1 className="font-editorial text-4xl">Matéria não encontrada</h1>
        </section>
      </main>
    );
  }

  const related = items.filter((item) => item.id !== current.id).slice(0, 2);
  const sponsor = sponsoredSlots[0];

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader active="noticias" />
      <section className="site-shell grid grid-cols-1 gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <article className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-72 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(180deg, rgba(17,24,39,.12), rgba(17,24,39,.6)), url(${current.imageUrl})` }} />
          <div className="space-y-4 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">{current.category}</p>
            <h1 className="font-editorial text-4xl leading-tight text-zinc-950 dark:text-zinc-100">{current.title}</h1>
            <p className="text-sm text-zinc-500">Por {current.author} - {formatDateBR(current.publishedAt)} - {current.readMinutes} min</p>
            <p className="text-lg leading-relaxed text-zinc-700 dark:text-zinc-200">{current.content}</p>
          </div>
        </article>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">Patrocinado</p>
            <h3 className="mt-2 font-editorial text-2xl">{sponsor.titulo}</h3>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{sponsor.descricao}</p>
            <Link href="/anuncios" className="mt-3 inline-block rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Ver todos patrocinados</Link>
          </div>
        </aside>
      </section>

      <section className="site-shell pb-10">
        <h2 className="mb-4 font-editorial text-3xl">Leia também</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {related.map((item) => (
            <EditorialCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </main>
  );
}
