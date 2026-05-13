"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NewsItem } from "@ir/types";

export function FeaturedHero({ items }: { items: NewsItem[] }): JSX.Element {
  const [index, setIndex] = useState(0);
  const current = useMemo(() => items[index] ?? items[0], [items, index]);

  const prev = (): void => setIndex((old) => (old === 0 ? items.length - 1 : old - 1));
  const next = (): void => setIndex((old) => (old === items.length - 1 ? 0 : old + 1));

  if (!current) return <></>;

  return (
    <article className="relative overflow-hidden rounded-sm bg-transparent self-start">
      <Link href={`/noticias/${current.slug}`} className="group block" key={current.id}>
        <div className="relative h-[300px] w-full md:h-[380px] xl:h-[420px]">
          <div className="hero-image-zoom hero-hover-image absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${current.imageUrl})` }} />
          <div className="hero-hover-overlay absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/70" />
          <div className="hero-sheen absolute inset-0" />

          <div className="hero-text-reveal absolute inset-x-0 bottom-0 p-4 md:p-6">
            <p className="inline-flex bg-white/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-900">{current.category}</p>
            <h1 className="mt-2 max-w-5xl font-editorial text-3xl leading-tight text-white drop-shadow md:text-4xl xl:text-5xl">{current.title}</h1>
            <p className="mt-2 inline-flex rounded-full border border-white/40 bg-black/30 px-3 py-1 text-[11px] font-semibold tracking-wide text-white">
              Passe o cursor e clique para abrir a matéria
            </p>
          </div>
        </div>
      </Link>

      <button type="button" onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-zinc-900/35 px-2.5 py-4 text-white hover:bg-zinc-900/55" aria-label="Destaque anterior">‹</button>
      <button type="button" onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-zinc-900/35 px-2.5 py-4 text-white hover:bg-zinc-900/55" aria-label="Próximo destaque">›</button>
    </article>
  );
}

