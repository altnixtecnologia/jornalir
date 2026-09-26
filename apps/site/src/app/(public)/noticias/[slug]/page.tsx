"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { expandedNewsData } from "../../../../components/site/content";
import { formatDateBR } from "../../../../components/site/date";
import { AdSlotColumn } from "../../../../components/site/AdSlotColumn";
import { AdSlotPairRow } from "../../../../components/site/AdSlotPairRow";
import { leftAdSlots, rightAdSlots, type AdSlot } from "../../../../components/site/adSlots";
import { ArticleGallery } from "../../../../components/site/ArticleGallery";
import { ReadAlsoCard } from "../../../../components/site/ReadAlsoCard";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { hasPhoto } from "../../../../components/site/siteArticleTypes";
import { getCategoryLabel } from "../../../../components/site/categories";
import { getPublishedNews, loadNewsItems, type CmsNewsItem } from "../../../../components/site/newsStorage";
import { estimateReadingMinutes, readingTimeLabel } from "../../../../components/site/readingTime";

/** Embaralha em uma nova cópia — nunca muta a lista original (Fisher-Yates). */
function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Volta para onde o leitor veio (home, editoria, busca, listagem) usando o histórico do navegador; só cai para a home se não houver um histórico válido do próprio site. */
function useSmartBack(): () => void {
  const router = useRouter();
  return () => {
    const cameFromSite =
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      document.referrer.startsWith(window.location.origin);
    if (cameFromSite) router.back();
    else router.push("/");
  };
}

export default function NoticiaDetalhePage(): JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [items, setItems] = useState<CmsNewsItem[]>(expandedNewsData as CmsNewsItem[]);
  const goBack = useSmartBack();

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
        <section className="site-shell py-16 text-center">
          <h1 className="font-editorial text-3xl">Matéria não encontrada</h1>
          <Link href="/" className="section-more mt-4 inline-flex">← Voltar ao início</Link>
        </section>
      </main>
    );
  }

  // "Leia também" (Fase 29, item 5): 4 sugestões aleatórias entre as
  // matérias elegíveis — nunca a própria matéria atual, nunca repetida
  // entre as 4 (cada item só existe uma vez na lista de origem).
  const readAlso = useMemo(
    () => shuffle(items.filter((item) => item.id !== current.id)).slice(0, 4),
    [items, current.id],
  );
  const withCover = hasPhoto(current);
  const readMinutes = estimateReadingMinutes(current.content);
  const mobilePair: [AdSlot, AdSlot] = [leftAdSlots[0], rightAdSlots[0]];

  return (
    <main className="min-h-screen">
      <SiteHeader active="noticias" />

      <article className="site-shell py-7">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[170px_minmax(0,1fr)_170px] 2xl:grid-cols-[200px_minmax(0,1fr)_200px] xl:items-start">
          <div className="hidden xl:block">
            <AdSlotColumn slots={leftAdSlots} side="left" />
          </div>

          {/* Título respira na largura editorial toda (antes da leitura); corpo, capa e metadados ficam na largura confortável de leitura. */}
          <div className="min-w-0">
            <button type="button" onClick={goBack} className="back-link mb-5 inline-flex items-center gap-1.5">
              <span aria-hidden="true">←</span> Voltar
            </button>

            <p className="kicker">{getCategoryLabel(current.category)}</p>
            <h1 className="article-title mt-3 font-editorial text-[clamp(28px,4.6vw,52px)] font-bold leading-[1.08] text-[color:var(--site-text)]">
              {current.title}
            </h1>

            <div className="mx-auto w-full max-w-3xl">
              {current.subtitle ? (
                <p className="mt-4 text-lg leading-snug text-[color:var(--site-muted)] md:text-xl">{current.subtitle}</p>
              ) : null}
              <p className="article-meta mt-3">
                Por {current.author} · {formatDateBR(current.publishedAt)} · {readingTimeLabel(readMinutes)}
                {current.locality ? ` · ${current.locality}` : ""}
              </p>

              {withCover ? (
                <figure className="relative mt-6">
                  <div className="h-[240px] rounded-sm bg-cover bg-center sm:h-[320px] md:h-[420px]" style={{ backgroundImage: `url(${current.imageUrl})` }} />
                  {current.gallery && current.gallery.length > 0 ? (
                    <a href="#article-gallery" className="gallery-indicator">
                      <span aria-hidden="true">▦</span> Ver {current.gallery.length + 1} fotos
                    </a>
                  ) : null}
                  {current.credit ? <figcaption className="mt-2 text-right text-[11px] text-[color:var(--site-muted)]">Foto: {current.credit}</figcaption> : null}
                </figure>
              ) : null}

              <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: current.content }} />

              {current.gallery && current.gallery.length > 0 ? (
                <div id="article-gallery" className="mt-10 scroll-mt-24">
                  <ArticleGallery images={current.gallery} />
                </div>
              ) : null}

              {/* Mobile: um par de publicidade, distribuído após a leitura — nunca colado na foto de capa. */}
              <div className="mt-10 md:hidden">
                <AdSlotPairRow slots={mobilePair} />
              </div>
            </div>
          </div>

          <div className="hidden xl:block">
            <AdSlotColumn slots={rightAdSlots} side="right" />
          </div>
        </div>
      </article>

      <section className="site-shell pb-14">
        <hr className="divider mb-8" />
        <div className="section-head">
          <h2>Leia também</h2>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          {readAlso.map((item) => (
            <ReadAlsoCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </main>
  );
}
