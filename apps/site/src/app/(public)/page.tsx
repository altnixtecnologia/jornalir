import { AdSenseSlot } from "../../components/site/AdSenseSlot";
import { AdSlotColumn } from "../../components/site/AdSlotColumn";
import { AdSlotPairRow } from "../../components/site/AdSlotPairRow";
import { adSlots, leftAdSlots, rightAdSlots, type AdSlot } from "../../components/site/adSlots";
import { SiteHeader } from "../../components/site/SiteHeader";
import { PublicFeaturedHero } from "../../components/site/public/PublicFeaturedHero";
import { PublicSecondaryHeadlines } from "../../components/site/public/PublicSecondaryHeadlines";
import { PublicLatestNewsList } from "../../components/site/public/PublicLatestNewsList";
import { PublicLocalSpotlight } from "../../components/site/public/PublicLocalSpotlight";
import { listPublicPlacement } from "../../lib/public/publicContentService";

// Sempre renderizada no request — nunca estática: publicação efetiva
// (Fase 30, item 2) muda a cada minuto (cron), uma página congelada em
// build time mostraria conteúdo desatualizado/errado.
export const dynamic = "force-dynamic";

// Página real (Fase 30) — os quatro blocos vêm direto das posições
// editoriais do banco (`ArticleService`-equivalente público), nunca de
// mock. Se o banco ainda não tem matérias publicadas, os blocos somem
// naturalmente (cada componente já retorna vazio sem itens) — nenhum
// conteúdo fictício é inserido como fallback.
export default async function HomePage(): Promise<JSX.Element> {
  const [mainCover, highlightStrip, latestNews, localSpotlight] = await Promise.all([
    listPublicPlacement("mainCover"),
    listPublicPlacement("highlightStrip"),
    listPublicPlacement("latestNews"),
    listPublicPlacement("localSpotlight"),
  ]);

  const hasAnyContent = mainCover.length > 0 || highlightStrip.length > 0 || latestNews.length > 0;

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
            <AdSlotColumn slots={leftAdSlots} side="left" />
          </div>

          <div className="min-w-0">
            <PublicLatestNewsList items={latestNews} />

            <div className="md:hidden">
              <AdSlotPairRow slots={pairA} />
            </div>

            <hr className="divider" />
            <div className="pt-10">
              <PublicLocalSpotlight items={localSpotlight} />
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
