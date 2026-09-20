"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateBR } from "./date";
import { hasPhoto, type SiteArticle } from "./siteArticleTypes";
import { getCategoryLabel } from "./categories";

/**
 * "Últimas notícias" como bloco editorial interativo: a matéria em destaque
 * à esquerda troca ao clicar em qualquer item da lista à direita — sem
 * navegar de página. A navegação real só acontece pelo botão "Ler matéria"
 * (ou pelo próprio título/foto no mobile, onde não há duas colunas).
 */
export function LatestNewsList({ items }: { items: SiteArticle[] }): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (items.length === 0) return <></>;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const list = items.filter((item) => item.id !== selected.id);

  return (
    <section className="pb-10">
      <div className="section-head">
        <h2>Últimas notícias</h2>
        <Link href="/noticias" className="section-more">
          Ver todas <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
        {/* Matéria selecionada */}
        <div key={selected.id} className="reveal-up">
          <div className="relative h-64 overflow-hidden rounded-sm md:h-80">
            {hasPhoto(selected) ? (
              <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${selected.imageUrl})` }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
                <span className="font-editorial text-3xl font-bold text-white/25">IR</span>
              </div>
            )}
          </div>
          <p className="kicker mt-4">{getCategoryLabel(selected.category)}</p>
          <h3 className="mt-2 font-editorial text-[26px] font-bold leading-tight text-[color:var(--site-text)] md:text-[30px]">
            {selected.title}
          </h3>
          <p className="mt-2 text-[15px] leading-snug text-[color:var(--site-muted)]">{selected.excerpt}</p>
          <Link
            href={`/noticias/${selected.slug}`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[color:var(--brand-red)] hover:gap-2.5"
          >
            Ler matéria <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Lista compacta das demais */}
        <ol className="divide-y divide-[color:var(--site-line)] lg:border-l lg:border-[color:var(--site-line)] lg:pl-8">
          {list.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="group flex w-full items-start gap-4 py-4 text-left"
              >
                <span className="font-editorial text-xl font-bold leading-none text-[color:var(--site-line)] group-hover:text-[color:var(--brand-red)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--site-muted)]">
                    {getCategoryLabel(item.category)} · {formatDateBR(item.publishedAt)}
                  </p>
                  <h4 className="mt-1 text-base font-semibold leading-snug text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)]">
                    {item.title}
                  </h4>
                </div>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
