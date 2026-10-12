import { SiteHeader } from "../../../components/site/SiteHeader";
import { AssineConfigurator } from "../../../components/site/public/AssineConfigurator";

export const dynamic = "force-dynamic";

export default function AssinePage(): JSX.Element {
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
          <h1 className="mt-3 max-w-4xl font-editorial text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Escolha como quer receber ou divulgar no Informativo Regional
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/85 md:text-base">
            Monte sua solicitação com assinatura anual, publicidade no jornal impresso e divulgação nos painéis digitais.
            Nenhuma seleção gera contratação automática: tudo passa pela avaliação e confirmação do setor comercial.
          </p>
        </div>

        <div className="mt-8">
          <AssineConfigurator />
        </div>
      </section>
    </main>
  );
}
