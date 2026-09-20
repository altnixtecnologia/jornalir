"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateBR } from "../../components/site/date";
import { expandedNewsData } from "../../components/site/content";
import { AdSenseSlot } from "../../components/site/AdSenseSlot";
import { AdSlotColumn } from "../../components/site/AdSlotColumn";
import { AdSlotPairRow } from "../../components/site/AdSlotPairRow";
import { adSlots, leftAdSlots, rightAdSlots, type AdSlot } from "../../components/site/adSlots";
import { FeaturedHero } from "../../components/site/FeaturedHero";
import { LatestNewsList } from "../../components/site/LatestNewsList";
import { LocalSpotlight } from "../../components/site/LocalSpotlight";
import { SiteHeader } from "../../components/site/SiteHeader";
import { getPublishedNews, loadNewsItems } from "../../components/site/newsStorage";
import { hasPhoto, type SiteArticle } from "../../components/site/siteArticleTypes";
import { getCategoryLabel } from "../../components/site/categories";

/** Chamadas secundárias em faixa horizontal, abaixo da manchete — texto em primeiro plano, sem repetir a linguagem de foto grande da manchete. */
function SecondaryHeadlines({ items }: { items: SiteArticle[] }): JSX.Element {
  if (items.length === 0) return <></>;
  return (
    <div className="grid grid-cols-1 divide-y divide-[color:var(--site-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <Link key={item.id} href={`/noticias/${item.slug}`} className="group flex gap-3 px-0 py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
          <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-sm">
            {hasPhoto(item) ? (
              <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${item.imageUrl})` }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
                <span className="font-editorial text-xs font-bold text-white/30">IR</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--brand-red)]">{getCategoryLabel(item.category)}</p>
            <h4 className="mt-1 text-[15px] font-semibold leading-snug text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)]">
              {item.title}
            </h4>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--site-muted)]">{formatDateBR(item.publishedAt)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function HomePage(): JSX.Element {
  const [newsItems, setNewsItems] = useState<SiteArticle[]>(expandedNewsData);

  useEffect(() => {
    void (async () => {
      const loaded = await loadNewsItems();
      setNewsItems(getPublishedNews(loaded));
    })();
  }, []);

  const featured = (newsItems.filter((i) => i.isFeatured).length > 0 ? newsItems.filter((i) => i.isFeatured) : newsItems).slice(0, 5);
  const heroIds = new Set(featured.map((i) => i.id));
  const secondary = newsItems.filter((i) => !heroIds.has(i.id)).slice(0, 3);
  const latest = newsItems.slice(0, 8);

  // Mobile: os 6 quadros em 3 pares, nunca os 6 juntos.
  const pairA: [AdSlot, AdSlot] = [adSlots[0], adSlots[1]];
  const pairB: [AdSlot, AdSlot] = [adSlots[2], adSlots[3]];
  const pairC: [AdSlot, AdSlot] = [adSlots[4], adSlots[5]];

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <AdSenseSlot />

      <FeaturedHero items={featured} />

      <section className="site-shell pt-8">
        <SecondaryHeadlines items={secondary} />
      </section>

      <div className="site-shell">
        <hr className="divider my-6" />
      </div>

      {/* Desktop grande/médio: 3 quadros | conteúdo | 3 quadros. Abaixo de xl, as colunas somem e o conteúdo ocupa a largura toda — nunca espremido. */}
      <section className="site-shell">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[170px_minmax(0,1fr)_170px] 2xl:grid-cols-[200px_minmax(0,1fr)_200px] xl:items-start">
          <div className="hidden xl:block">
            <AdSlotColumn slots={leftAdSlots} side="left" />
          </div>

          <div className="min-w-0">
            {/* Editorias empilhadas foram removidas — continuam acessíveis pelo menu superior.
                "Últimas notícias" vira o bloco dinâmico central: destaque interativo + lista. */}
            <LatestNewsList items={latest} />

            <div className="md:hidden">
              <AdSlotPairRow slots={pairA} />
            </div>

            <hr className="divider" />
            <div className="pt-10">
              <LocalSpotlight items={newsItems} />
            </div>

            <div className="mt-8 md:hidden">
              <AdSlotPairRow slots={pairB} />
            </div>

            <div className="mt-2 pb-4 md:hidden">
              <AdSlotPairRow slots={pairC} />
            </div>
          </div>

          <div className="hidden xl:block">
            <AdSlotColumn slots={rightAdSlots} side="right" />
          </div>
        </div>
      </section>
    </main>
  );
}
