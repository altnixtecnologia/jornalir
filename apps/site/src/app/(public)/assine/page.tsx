import { SiteHeader } from "../../../components/site/SiteHeader";
import { AssineConfigurator } from "../../../components/site/public/AssineConfigurator";
import { getPublicSiteOfferSettings } from "../../../lib/public/siteOfferSettingsService";

export const dynamic = "force-dynamic";

export default async function AssinePage(): Promise<JSX.Element> {
  const offerSettings = await getPublicSiteOfferSettings();

  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />

      <section className="site-shell py-5 md:py-6">
        <div
          className="overflow-hidden rounded-2xl border p-5 text-white shadow-xl md:p-6"
          style={{
            borderColor: "var(--site-line)",
            background:
              "radial-gradient(800px 360px at 90% 0%, rgba(192,48,48,.22), transparent 60%), linear-gradient(135deg, #23234d 0%, #30305c 62%, #20203f 100%)",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/65">ASSINE E ANUNCIE</p>
          <h1 className="mt-2 font-editorial font-bold leading-[1.02] sm:text-[clamp(2rem,5vw,3rem)] lg:text-[clamp(2.4rem,4vw,3.35rem)] xl:whitespace-nowrap xl:text-[clamp(2.35rem,3vw,3.6rem)]">
            <span className="text-[clamp(1.15rem,5.4vw,1.6rem)] sm:hidden">
              Escolha como quer receber ou
              <br />
              divulgar no Informativo Regional
            </span>
            <span className="hidden sm:inline">Escolha como quer receber ou divulgar no Informativo Regional</span>
          </h1>
          <p className="mt-3 max-w-5xl text-sm leading-snug text-white/85">
            Monte sua solicitação com assinatura anual, publicidade no jornal impresso e divulgação nos painéis digitais.
            Nenhuma seleção gera contratação automática: tudo passa pela avaliação e confirmação do setor comercial.
          </p>

          <div className="mt-4 border-t border-white/15 pt-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/90">
              <strong className="text-white">1.000 exemplares</strong>
              <span>Todas as quintas-feiras</span>
              <span>Circulação regional em 7 municípios</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-white/70">
              <strong className="text-white/85">SC:</strong> São João do Sul, Praia Grande, Passo de Torres e Santa Rosa do Sul
              <span className="mx-2 hidden sm:inline">•</span>
              <span className="block sm:inline"><strong className="text-white/85">RS:</strong> Mampituba, Morrinhos do Sul e Torres</span>
            </p>
          </div>
        </div>

        <div className="mt-5">
          <AssineConfigurator settings={offerSettings} />
        </div>
      </section>
    </main>
  );
}
