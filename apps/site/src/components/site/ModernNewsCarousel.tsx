"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { NewsItem } from "@ir/types";
import { formatDateBR } from "./date";

interface ModernNewsCarouselProps {
  items: NewsItem[];
}

export function ModernNewsCarousel({ items }: ModernNewsCarouselProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const total = items.length;
  const current = useMemo(() => items[index] ?? items[0], [items, index]);

  function prev(): void {
    setIndex((old) => (old === 0 ? total - 1 : old - 1));
  }

  function next(): void {
    setIndex((old) => (old === total - 1 ? 0 : old + 1));
  }

  useEffect(() => {
    if (total <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((old) => (old === total - 1 ? 0 : old + 1));
    }, 7000);
    return () => window.clearInterval(timer);
  }, [total]);

  if (!current || total === 0) return <></>;

  const sideItems = Array.from({ length: Math.min(3, total - 1) }, (_, i) => items[(index + i + 1) % total]);

  return (
    <section className="mt-12 overflow-hidden rounded-2xl border border-zinc-300 bg-gradient-to-br from-cyan-700 via-sky-700 to-blue-800 p-4 text-white shadow-xl dark:border-zinc-700">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-editorial text-3xl">Mais Notícias</h2>
        <div className="flex gap-2">
          <button type="button" onClick={prev} className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30" aria-label="Anterior">‹</button>
          <button type="button" onClick={next} className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30" aria-label="Próxima">›</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Link href={`/noticias/${current.slug}`} className="group relative block min-h-[320px] overflow-hidden rounded-xl border border-white/25">
          <div className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${current.imageUrl})` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="absolute bottom-0 p-4">
            <p className="inline-flex rounded bg-white/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-900">{current.category}</p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight">{current.title}</h3>
            <p className="mt-2 text-xs text-zinc-200">{formatDateBR(current.publishedAt)}</p>
          </div>
        </Link>

        <div className="space-y-3">
          {sideItems.map((item) => (
            <Link key={item.id} href={`/noticias/${item.slug}`} className="group grid grid-cols-[110px_1fr] gap-3 rounded-xl border border-white/20 bg-white/10 p-2 hover:bg-white/15">
              <div className="h-20 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${item.imageUrl})` }} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-100">{item.category}</p>
                <h4 className="mt-1 text-sm font-semibold leading-tight">{item.title}</h4>
                <p className="mt-1 text-[11px] text-zinc-200">{formatDateBR(item.publishedAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-2.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2.5 bg-white/45 hover:bg-white/65"}`}
            aria-label={`Ir para notícia ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
