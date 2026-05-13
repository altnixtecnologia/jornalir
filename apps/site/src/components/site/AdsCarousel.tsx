"use client";

import { useMemo, useState } from "react";
import type { SponsoredSlot } from "./content";

interface AdsCarouselProps {
  items: SponsoredSlot[];
}

export function AdsCarousel({ items }: AdsCarouselProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const current = useMemo(() => items[index] ?? null, [items, index]);

  if (!current) return <section className="py-4 text-sm text-zinc-500">Sem anuncios ativos.</section>;

  return (
    <section className="border-l-2 border-[color:var(--site-accent)] pl-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--site-accent)]">Patrocinados</p>
      <div className="mt-3 h-44 overflow-hidden">
        <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${current.imagem})` }} />
      </div>
      <h3 className="mt-3 font-editorial text-2xl leading-tight">{current.titulo}</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{current.marca}</p>
      <div className="mt-3 flex gap-2">
        {items.map((it, i) => (
          <button key={it.id} onClick={() => setIndex(i)} className={`h-2 w-6 ${i === index ? "bg-[color:var(--site-accent)]" : "bg-zinc-300 dark:bg-zinc-700"}`} aria-label={`Anuncio ${i + 1}`} />
        ))}
      </div>
    </section>
  );
}
