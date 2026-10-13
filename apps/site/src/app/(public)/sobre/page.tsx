import Link from "next/link";
import { SiteHeader } from "../../../components/site/SiteHeader";

const coverage = [
  { state: "SC", cities: "São João do Sul, Praia Grande, Passo de Torres e Santa Rosa do Sul" },
  { state: "RS", cities: "Mampituba, Morrinhos do Sul e Torres" },
];

const pillars = [
  {
    title: "Informação regional",
    text: "Notícias e conteúdos voltados à vida das comunidades do Extremo Sul Catarinense e do Litoral Norte Gaúcho.",
  },
  {
    title: "Jornal impresso",
    text: "Uma edição semanal com circulação às quintas-feiras, mantendo o jornal presente no cotidiano da região.",
  },
  {
    title: "Presença digital",
    text: "Portal, redes sociais e Jornal Online ampliam o acesso às matérias e às edições do Informativo Regional.",
  },
  {
    title: "Espaço para anunciantes",
    text: "Publicidade no impresso e soluções digitais conectam empresas, serviços e campanhas ao público regional.",
  },
];

export default function SobrePage(): JSX.Element {
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />

      <section className="site-shell py-7">
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--site-line)", background: "var(--brand-navy)" }}
        >
          <div className="grid items-center gap-6 p-6 text-white md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                Informativo Regional
              </p>
              <h1 className="mt-2 max-w-3xl font-editorial text-4xl leading-tight md:text-5xl">
                Informação próxima de quem vive a região
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/85 md:text-base">
                O Informativo Regional reúne jornal impresso e presença digital para acompanhar os fatos,
                serviços, histórias e acontecimentos que fazem parte do dia a dia das comunidades atendidas.
              </p>
            </div>

            <div className="hidden rounded-xl bg-white/95 p-4 md:block">
              <img
                src="/brand/logo-escrita.png"
                alt="Informativo Regional"
                className="h-auto w-[230px]"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
            <strong className="block text-2xl" style={{ color: "var(--brand-navy)" }}>1.000</strong>
            <span className="text-sm" style={{ color: "var(--site-muted)" }}>exemplares por edição</span>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
            <strong className="block text-2xl" style={{ color: "var(--brand-navy)" }}>7 municípios</strong>
            <span className="text-sm" style={{ color: "var(--site-muted)" }}>em Santa Catarina e Rio Grande do Sul</span>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
            <strong className="block text-2xl" style={{ color: "var(--brand-navy)" }}>Quintas-feiras</strong>
            <span className="text-sm" style={{ color: "var(--site-muted)" }}>circulação semanal do jornal impresso</span>
          </div>
        </div>

        <section className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--brand-red)" }}>
            Nossa atuação
          </p>
          <h2 className="mt-1 font-editorial text-3xl">Impresso e digital trabalhando juntos</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {pillars.map((pillar) => (
              <article
                key={pillar.title}
                className="rounded-xl border p-5"
                style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
              >
                <h3 className="font-editorial text-2xl">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
                  {pillar.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="mt-7 rounded-2xl border p-5 md:p-6"
          style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--brand-red)" }}>
            Circulação regional
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {coverage.map((item) => (
              <div key={item.state} className="rounded-lg border p-4" style={{ borderColor: "var(--site-line)" }}>
                <strong style={{ color: "var(--brand-navy)" }}>{item.state}</strong>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
                  {item.cities}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/jornal-online"
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--brand-navy)" }}
          >
            Ler o Jornal Online
          </Link>
          <Link
            href="/assine"
            className="rounded-lg border px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: "var(--site-line)", color: "var(--site-text)" }}
          >
            Assine ou anuncie
          </Link>
          <Link
            href="/contato"
            className="rounded-lg border px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: "var(--site-line)", color: "var(--site-text)" }}
          >
            Fale conosco
          </Link>
        </div>
      </section>
    </main>
  );
}
