import { SiteHeader } from "../../../components/site/SiteHeader";
import { AssineConfigurator } from "../../../components/site/public/AssineConfigurator";
import { getPublicSiteOfferSettings } from "../../../lib/public/siteOfferSettingsService";

export const dynamic = "force-dynamic";

export default async function AssinePage(): Promise<JSX.Element> {
  const offerSettings = await getPublicSiteOfferSettings();

  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />

      <section className="site-shell py-8 md:py-10">
        <div
          className="overflow-hidden rounded-3xl border p-7 text-white shadow-2xl md:p-10"
          style={{
            borderColor: "var(--site-line)",
            background:
              "radial-gradient(800px 360px at 90% 0%, rgba(192,48,48,.22), transparent 60%), linear-gradient(135deg, #23234d 0%, #30305c 62%, #20203f 100%)",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/65">ASSINE E ANUNCIE</p>
          <h1 className="mt-3 font-editorial font-bold leading-[1.02] sm:text-[clamp(2rem,5vw,3rem)] lg:text-[clamp(2.4rem,4vw,3.35rem)] xl:whitespace-nowrap xl:text-[clamp(2.35rem,3vw,3.6rem)]">
            <span className="text-[clamp(1.15rem,5.4vw,1.6rem)] sm:hidden">
              Escolha como quer receber ou
              <br />
              divulgar no Informativo Regional
            </span>
            <span className="hidden sm:inline">Escolha como quer receber ou divulgar no Informativo Regional</span>
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/85 md:text-base">
            Monte sua solicitação com assinatura anual, publicidade no jornal impresso e divulgação nos painéis digitais.
            Nenhuma seleção gera contratação automática: tudo passa pela avaliação e confirmação do setor comercial.
          </p>
        </div>

        <div className="mt-8">
          <AssineConfigurator settings={offerSettings} />
        </div>
      </section>
    </main>
  );
}
