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

// Sempre renderizada no request — nunca estática: publicação efetiva
// (Fase 30, item 2) muda a cada minuto (cron), uma página congelada em
// build time mostraria conteúdo desatualizado/errado.
export const dynamic = "force-dynamic";

/** Defasagem fixa entre quadros (nunca trocam em sincronia) — item 6.4 da Fase 6, nunca configurável por slot de propósito (só o intervalo/efeito são globais). */
const PHASE_OFFSET_STEP_MS = 1200;

// Página real (Fase 30) — os quatro blocos editoriais vêm direto das
// posições do banco, nunca de mock. Patrocinadores do site (Fase 6) vêm
// das views públicas (ver siteAdsService) com fallback seguro — nunca
// derruba a home se o banco estiver indisponível/sem dado.
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
    return {
      id: `slot-${slotNumber}`,
      label: `Quadro ${slotNumber}`,
      rotateMs: siteAds.settings.rotationIntervalMs,
      phaseOffsetMs: index * PHASE_OFFSET_STEP_MS,
      creatives: media.map((item) => ({ id: item.id, imageUrl: item.imageUrl, href: item.href, alt: item.altText })),
    };
  });
  const leftAdSlots = adSlots.slice(0, 3);
  const rightAdSlots = adSlots.slice(3, 6);

  // Mobile: os 6 quadros em 3 pares, nunca os 6 juntos.
  const pairA: [AdSlot, AdSlot] = [adSlots[0], adSlots[1]];
  const pairB: [AdSlot, AdSlot] = [adSlots[2], adSlots[3]];
  const pairC: [AdSlot, AdSlot] = [adSlots[4], adSlots[5]];

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <AdSenseSlot />

      {mainCover.length > 0 ? (
        <PublicFeaturedHero items={mainCover} />
      ) : !hasAnyContent ? (
        <section className="hero-stage hero-backdrop relative flex w-full items-center justify-center overflow-hidden py-24">
          <div className="site-shell text-center">
            <p className="kicker" style={{ color: "#fff" }}>Informativo Regional</p>
            <h1 className="mt-4 font-editorial text-3xl font-bold text-white md:text-5xl">
              Em breve, as primeiras matérias por aqui
            </h1>
            <p className="mt-4 text-white/70">A redação está preparando o conteúdo do novo portal.</p>
          </div>
        </section>
      ) : null}

      <section className="site-shell pt-8">
        <PublicSecondaryHeadlines items={highlightStrip} />
      </section>

      <div className="site-shell">
        <hr className="divider my-6" />
      </div>

      <section className="site-shell">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[170px_minmax(0,1fr)_170px] 2xl:grid-cols-[200px_minmax(0,1fr)_200px] xl:items-start">
          <div className="hidden xl:block">
            <AdSlotColumn slots={leftAdSlots} side="left" effect={siteAds.settings.transitionEffect} />
          </div>

          <div className="min-w-0">
            <PublicLatestNewsList items={latestNews} />

            <div className="md:hidden">
              <AdSlotPairRow slots={pairA} effect={siteAds.settings.transitionEffect} />
            </div>
          </div>

          <div className="hidden xl:block">
            <AdSlotColumn slots={rightAdSlots} side="right" effect={siteAds.settings.transitionEffect} />
          </div>
        </div>

        {/* "Mais destaques" sai da coluna central estreita (entre as duas
            colunas de publicidade) e passa a ocupar a largura total do
            site-shell — espaço melhor aproveitado pelo grid 2×2 de 4
            matérias (revisão visual do portal público). */}
        <hr className="divider mt-10" />
        <div className="pt-10">
          <PublicLocalSpotlight items={localSpotlight} />
        </div>

        <div className="mt-8 md:hidden">
          <AdSlotPairRow slots={pairB} effect={siteAds.settings.transitionEffect} />
        </div>

        <div className="mt-2 pb-4 md:hidden">
          <AdSlotPairRow slots={pairC} effect={siteAds.settings.transitionEffect} />
        </div>
      </section>
    </main>
  );
}
