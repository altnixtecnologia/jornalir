import { AdSenseSlot } from "../../components/site/AdSenseSlot";
import { AdSlotColumn } from "../../components/site/AdSlotColumn";
import { AdSlotPairRow } from "../../components/site/AdSlotPairRow";
import type { AdSlot } from "../../components/site/adSlots";
import { SiteHeader } from "../../components/site/SiteHeader";
import { PublicFeaturedHero } from "../../components/site/public/PublicFeaturedHero";
import { PublicSecondaryHeadlines } from "../../components/site/public/PublicSecondaryHeadlines";
import { PublicLatestNewsList } from "../../components/site/public/PublicLatestNewsList";
import { PublicLocalSpotlight } from "../../components/site/public/PublicLocalSpotlight";
import { listPublicPlacement } from "../../lib/public/publicContentService";
import { getPublicSiteAds } from "../../lib/public/siteAdsService";

export const dynamic = "force-dynamic";
const PHASE_OFFSET_STEP_MS = 1200;

function slotLabel(slotNumber: number): string {
  const position = Math.ceil(slotNumber / 2);
  const side = slotNumber % 2 === 1 ? "Esquerda" : "Direita";
  return "Posição " + position + " - " + side;
}

export default async function HomePage(): Promise<JSX.Element> {
  const [mainCover, highlightStrip, latestNews, localSpotlight, siteAds] = await Promise.all([
    listPublicPlacement("mainCover"),
    listPublicPlacement("highlightStrip"),
    listPublicPlacement("latestNews"),
    listPublicPlacement("localSpotlight"),
    getPublicSiteAds(),
  ]);

  const hasAnyContent = mainCover.length > 0 || highlightStrip.length > 0 || latestNews.length > 0;

  const adSlots: AdSlot[] = Array.from({ length: 6 }, (_, index) => {
    const slotNumber = index + 1;
    const media = siteAds.mediaBySlot.get(slotNumber) ?? [];
    const config = media[0];
    return {
      id: "slot-" + slotNumber,
      label: slotLabel(slotNumber),
      rotateMs: config?.rotationIntervalMs ?? 10000,
      phaseOffsetMs: index * PHASE_OFFSET_STEP_MS,
      transitionEffect: config?.transitionEffect ?? "fade",
      fitMode: config?.fitMode ?? "contain",
      // Cada item já vem com seu próprio tempo/efeito/formato resolvidos (override da
      // imagem ou, na ausência dele, o padrão da posição) — ver getPublicSiteAds().
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
  const mobilePairs: [[AdSlot, AdSlot], [AdSlot, AdSlot], [AdSlot, AdSlot]] = [
    [adSlots[0], adSlots[1]],
    [adSlots[2], adSlots[3]],
    [adSlots[4], adSlots[5]],
  ];

  return (
    <main className="min-h-screen">
      {mainCover.length > 0 ? (
        <>
          <PublicFeaturedHero items={mainCover} />
          <SiteHeader emphasized />
          <AdSenseSlot />
        </>
      ) : (
        <>
          <SiteHeader />
          <AdSenseSlot />
          {!hasAnyContent ? (
            <section className="hero-stage hero-backdrop relative flex w-full items-center justify-center overflow-hidden py-24">
              <div className="site-shell text-center">
                <p className="kicker" style={{ color: "#fff" }}>Informativo Regional</p>
                <h1 className="mt-4 font-editorial text-3xl font-bold text-white md:text-5xl">Em breve, as primeiras matérias por aqui</h1>
                <p className="mt-4 text-white/70">A redação está preparando o conteúdo do novo portal.</p>
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="site-shell pt-8"><PublicSecondaryHeadlines items={highlightStrip} /></section>
      <div className="site-shell"><hr className="divider my-6" /></div>

      <section className="site-shell">
        <div className="home-latest-news-grid grid grid-cols-1 gap-10 xl:grid-cols-[170px_minmax(0,1fr)_170px] 2xl:grid-cols-[200px_minmax(0,1fr)_200px] xl:items-start">
          <div className="hidden xl:block"><AdSlotColumn slots={leftAdSlots} side="left" /></div>

          <div className="min-w-0">
            <div className="mb-7 md:hidden"><AdSlotPairRow slots={mobilePairs[0]} /></div>
            <PublicLatestNewsList items={latestNews} />
            <div className="mt-1 md:hidden"><AdSlotPairRow slots={mobilePairs[1]} /></div>
          </div>

          <div className="hidden xl:block"><AdSlotColumn slots={rightAdSlots} side="right" /></div>
        </div>

        <hr className="divider mt-10" />
        <div className="pt-10"><PublicLocalSpotlight items={localSpotlight} /></div>
        <div className="mt-8 pb-4 md:hidden"><AdSlotPairRow slots={mobilePairs[2]} /></div>
      </section>
    </main>
  );
}
