import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateBR } from "../../../../components/site/date";
import { AdSlotColumn } from "../../../../components/site/AdSlotColumn";
import { AdSlotPairRow } from "../../../../components/site/AdSlotPairRow";
import { leftAdSlots, rightAdSlots, type AdSlot } from "../../../../components/site/adSlots";
import { ArticleGallery } from "../../../../components/site/ArticleGallery";
import { PublicReadAlsoCard } from "../../../../components/site/public/PublicReadAlsoCard";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { estimateReadingMinutes, readingTimeLabel } from "../../../../components/site/readingTime";
import { getPublicArticleBySlug, getReadAlso } from "../../../../lib/public/publicContentService";

// Sempre no request — matéria pode virar pública automaticamente a
// qualquer minuto (cron de agendamento, Fase 30).
export const dynamic = "force-dynamic";

export default async function NoticiaDetalhePage({ params }: { params: { slug: string } }): Promise<JSX.Element> {
  const current = await getPublicArticleBySlug(params.slug);
  if (!current) notFound();

  const readAlso = await getReadAlso(current, 4);
  const readMinutes = estimateReadingMinutes(current.body);
  const galleryImages = current.gallery.map((item) => ({ url: item.url, caption: item.caption, credit: item.credit }));
  const mobilePair: [AdSlot, AdSlot] = [leftAdSlots[0], rightAdSlots[0]];

  return (
    <main className="min-h-screen">
      <SiteHeader active="noticias" />

      <article className="site-shell py-7">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[170px_minmax(0,1fr)_170px] 2xl:grid-cols-[200px_minmax(0,1fr)_200px] xl:items-start">
          <div className="hidden xl:block">
            <AdSlotColumn slots={leftAdSlots} side="left" />
          </div>

          <div className="min-w-0">
            <Link href="/" className="back-link mb-5 inline-flex items-center gap-1.5">
              <span aria-hidden="true">←</span> Voltar
            </Link>

            <p className="kicker">{current.sectionName}</p>
            <h1 className="article-title mt-3 font-editorial text-[clamp(28px,4.6vw,52px)] font-bold leading-[1.08] text-[color:var(--site-text)]">
              {current.title}
            </h1>

            <div className="mx-auto w-full max-w-3xl">
              {current.subtitle ? (
                <p className="mt-4 text-lg leading-snug text-[color:var(--site-muted)] md:text-xl">{current.subtitle}</p>
              ) : null}
              <p className="article-meta mt-3">
                {formatDateBR(current.publishedAt)} · {readingTimeLabel(readMinutes)}
                {current.localityName ? ` · ${current.localityName}` : ""}
                {current.urgent ? " · Urgente" : ""}
              </p>

              {current.cover ? (
                <figure className="relative mt-6">
                  <div
                    className="h-[240px] rounded-sm bg-cover bg-center sm:h-[320px] md:h-[420px]"
                    style={{ backgroundImage: `url(${current.cover.url})` }}
                  />
                  {current.gallery.length > 0 ? (
                    <a href="#article-gallery" className="gallery-indicator">
                      <span aria-hidden="true">▦</span> Ver {current.gallery.length + 1} fotos
                    </a>
                  ) : null}
                  {current.cover.credit ? (
                    <figcaption className="mt-2 text-right text-[11px] text-[color:var(--site-muted)]">Foto: {current.cover.credit}</figcaption>
                  ) : null}
                </figure>
              ) : null}

              <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: current.body }} />

              {current.gallery.length > 0 ? (
                <div id="article-gallery" className="mt-10 scroll-mt-24">
                  <ArticleGallery images={galleryImages} />
                </div>
              ) : null}

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

      {readAlso.length > 0 ? (
        <section className="site-shell pb-14">
          <hr className="divider mb-8" />
          <div className="section-head">
            <h2>Leia também</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            {readAlso.map((item) => (
              <PublicReadAlsoCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
