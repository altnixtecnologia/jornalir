"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { NewsItem } from "@ir/types";
import { expandedNewsData } from "../../components/site/content";
import { formatDateBR } from "../../components/site/date";
import { FeaturedHero } from "../../components/site/FeaturedHero";
import { ModernNewsCarousel } from "../../components/site/ModernNewsCarousel";
import { PaidAdsColumn, PaidAdsStrip } from "../../components/site/PaidAdsColumn";
import { SiteHeader } from "../../components/site/SiteHeader";
import { paidAdSlots } from "../../components/site/siteSettings";
import { getPublishedNews, loadNewsItems } from "../../components/site/newsStorage";

function repeatToCount(items: NewsItem[], start: number, total: number): NewsItem[] {
  const base = items.slice(start);
  if (base.length === 0) return [];
  return Array.from({ length: total }, (_, idx) => base[idx % base.length]);
}

function UnderHeroEditorial({ items }: { items: NewsItem[] }): JSX.Element {
  const leftPhoto = repeatToCount(items, 1, 6);
  const rightText = repeatToCount(items, 1, 6);

  return (
    <section className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.95fr]">
      <div className="space-y-0 border-r border-zinc-300 pr-4 dark:border-zinc-700">
        {leftPhoto.map((item, idx) => (
          <Link key={`left-${item.id}-${idx}`} href={`/noticias/${item.slug}`} className="grid grid-cols-[130px_1fr] gap-3 border-b border-zinc-300 py-3 dark:border-zinc-700 md:grid-cols-[210px_1fr]">
            <div className="h-28 w-full bg-cover bg-center md:h-[122px]" style={{ backgroundImage: `url(${item.imageUrl})` }} />
            <div>
              <h4 className="text-lg font-semibold leading-tight md:text-xl">{item.title}</h4>
              <p className="mt-1 text-xs text-zinc-500">{formatDateBR(item.publishedAt)}</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 md:text-sm">{item.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>

      <aside className="space-y-0">
        {rightText.map((item, idx) => (
          <Link key={`right-${item.id}-${idx}`} href={`/noticias/${item.slug}`} className="flex min-h-[126px] items-center border-b border-zinc-300 py-3 dark:border-zinc-700 md:min-h-[146px]">
            <div>
              <h5 className="text-2xl font-semibold leading-tight md:text-[2.2rem]">{item.title}</h5>
              <p className="mt-1 text-xs text-zinc-500">{formatDateBR(item.publishedAt)}</p>
            </div>
          </Link>
        ))}
      </aside>
    </section>
  );
}

export default function HomePage(): JSX.Element {
  const [newsItems, setNewsItems] = useState<NewsItem[]>(expandedNewsData);
  const featuredItems = (newsItems.filter((i) => i.isFeatured).length > 0 ? newsItems.filter((i) => i.isFeatured) : newsItems).slice(0, 4);
  const latestNews = newsItems.slice(0, 10);

  // Desktop keeps the original slots distribution.
  const desktopBigSlots = paidAdSlots.filter((slot) => slot.sizeType === "grande");
  const desktopSmallSlots = paidAdSlots.filter((slot) => slot.sizeType === "medio");

  // Mobile keeps the compact mode: one large and one small rotating all creatives.
  const mobileBigSlots = paidAdSlots
    .filter((slot) => slot.sizeType === "grande")
    .slice(0, 1)
    .map((slot) => ({
      ...slot,
      id: "mobile-big-all",
      label: "Grande Mobile",
      rotateMs: 6000,
      creatives: paidAdSlots.filter((s) => s.sizeType === "grande").flatMap((s) => s.creatives)
    }));
  const mobileSmallSlots = paidAdSlots
    .filter((slot) => slot.sizeType === "medio")
    .slice(0, 1)
    .map((slot) => ({
      ...slot,
      id: "mobile-small-all",
      label: "Pequena Mobile",
      rotateMs: 6000,
      creatives: paidAdSlots.filter((s) => s.sizeType === "medio").flatMap((s) => s.creatives)
    }));

  useEffect(() => {
    void (async () => {
      const loaded = await loadNewsItems();
      setNewsItems(getPublishedNews(loaded));
    })();
  }, []);

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="site-shell py-6">
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex h-full flex-col">
            <div>
              <FeaturedHero items={featuredItems} />
              <UnderHeroEditorial items={newsItems} />
            </div>
            <div className="mt-auto hidden pt-3 lg:block">
              <PaidAdsStrip slots={desktopSmallSlots} />
            </div>
          </div>
          <div className="hidden lg:block">
            <PaidAdsColumn slots={desktopBigSlots} />
          </div>
        </div>
        <div className="mt-5 space-y-3 lg:hidden">
          <PaidAdsColumn slots={mobileBigSlots} />
          <PaidAdsStrip slots={mobileSmallSlots} />
        </div>

        <ModernNewsCarousel items={latestNews} />
      </section>
    </main>
  );
}
