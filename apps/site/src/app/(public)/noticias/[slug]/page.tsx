import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateBR } from "../../../../components/site/date";
import { AdSlotColumn } from "../../../../components/site/AdSlotColumn";
import { AdSlotPairRow } from "../../../../components/site/AdSlotPairRow";
import type { AdSlot } from "../../../../components/site/adSlots";
import { ArticleMediaViewer } from "../../../../components/site/ArticleMediaViewer";
import { PublicReadAlsoCard } from "../../../../components/site/public/PublicReadAlsoCard";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { estimateReadingMinutes, readingTimeLabel } from "../../../../components/site/readingTime";
import { getPublicArticleBySlug, getReadAlso } from "../../../../lib/public/publicContentService";
import { getPublicSiteAds } from "../../../../lib/public/siteAdsService";

// Sempre no request — matéria pode virar pública automaticamente a
// qualquer minuto (cron de agendamento, Fase 30).
export const dynamic = "force-dynamic";

const PHASE_OFFSET_STEP_MS = 1200;

export default async function NoticiaDetalhePage({ params }: { params: { slug: string } }): Promise<JSX.Element> {
  const current = await getPublicArticleBySlug(params.slug);
  if (!current) notFound();

  const [readAlso, siteAds] = await Promise.all([getReadAlso(current, 4), getPublicSiteAds()]);
  const readMinutes = estimateReadingMinutes(current.body);
  const galleryImages = current.gallery.map((item) => ({ url: item.url, caption: item.caption, credit: item.credit }));

  const adSlots: AdSlot[] = Array.from({ length: 6 }, (_, index) => {
    const slotNumber = index + 1;
    const media = siteAds.mediaBySlot.get(slotNumber) ?? [];
    const config = media[0];
    return {
      id: `slot-${slotNumber}`,
      label: `Posição ${Math.ceil(slotNumber / 2)} - ${slotNumber % 2 === 1 ? "Esquerda" : "Direita"}`,
      rotateMs: config?.rotationIntervalMs ?? 10000,
      phaseOffsetMs: index * PHASE_OFFSET_STEP_MS,
      transitionEffect: config?.transitionEffect ?? "fade",
      fitMode: config?.fitMode ?? "contain",
      creatives: media.map((item) => ({
        id: item.id,
        imageUrl: item.imageUrl,
        href: item.href,
        alt: item.altText,
        rotateMs: item.rotationIntervalMs,
        transitionEffect: item.transitionEffect,
        fitMode: item.fitMode,
      })),
    };
  });
  const leftAdSlots = [adSlots[0], adSlots[2], adSlots[4]];
  const rightAdSlots = [adSlots[1], adSlots[3], adSlots[5]];
  const mobilePair: [AdSlot, AdSlot] = [adSlots[0], adSlots[1]];

  return (
    <main className="min-h-screen">
      <SiteHeader active="noticias" />

      <article className="site-shell py-7">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[170px_minmax(0,1fr)_170px] 2xl:grid-cols-[200px_minmax(0,1fr)_200px] xl:items-start">
          <div className="hidden xl:block">
            <AdSlotColumn slots={leftAdSlots} side="left" />
          </div>

          <div className="min-w-0">
            <Link
              href={current.sectionSlug ? `/editoria/${current.sectionSlug}` : "/noticias"}
              className="back-link mb-5 inline-flex items-center gap-1.5"
            >
              <span aria-hidden="true">←</span> Voltar para {current.sectionSlug ? current.sectionName : "Notícias"}
            </Link>

            {/* Revisão de largura de leitura: título/subtítulo/metadados/corpo
                agora vivem na MESMA coluna (max-w-3xl) — antes o título ficava
                fora, podendo se esticar mais largo que o resto do texto em
                telas largas (xl/2xl), quebrando a leitura em dois larguras
                diferentes. */}
            <div className="mx-auto w-full max-w-3xl">
              <p className="kicker">{current.sectionName}</p>
              <h1 className="article-title mt-3 font-editorial text-[clamp(28px,4.6vw,52px)] font-bold leading-[1.08] text-[color:var(--site-text)]">
                {current.title}
              </h1>
              {current.subtitle ? (
                <p className="mt-4 text-lg leading-snug text-[color:var(--site-muted)] md:text-xl">{current.subtitle}</p>
              ) : null}
              <p className="article-meta mt-3">
                {formatDateBR(current.publishedAt)} · {readingTimeLabel(readMinutes)}
                {current.localityName ? ` · ${current.localityName}` : ""}
                {current.urgent ? " · Urgente" : ""}
              </p>

              <ArticleMediaViewer
                cover={current.cover ? { url: current.cover.url, caption: current.cover.caption, credit: current.cover.credit } : undefined}
                coverCredit={current.cover?.credit}
                gallery={galleryImages}
                bodyHtml={current.body}
              />

              <div className="mt-10 xl:hidden">
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
