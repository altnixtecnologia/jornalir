import { SiteHeader } from "../../../components/site/SiteHeader";

const historyBlocks = [
  {
    year: "2000s",
    title: "A origem comunitária",
    text: "O Informativo Regional nasceu com uma missão simples e poderosa: registrar a vida local com proximidade, credibilidade e voz para quem faz a região acontecer no dia a dia.",
    image: "https://images.unsplash.com/photo-1516541196182-6bdb0516ed27?auto=format&fit=crop&w=1400&q=80"
  },
  {
    year: "2010s",
    title: "Consolidação no impresso",
    text: "Com o crescimento da circulação, o jornal se tornou referência para famílias, empreendedores e lideranças locais, conectando informação, serviços e oportunidades.",
    image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1400&q=80"
  },
  {
    year: "2015+",
    title: "A pauta da comunidade em primeiro plano",
    text: "A cobertura ampliou editorias e fortaleceu temas que importam para o leitor: educação, saúde, segurança, esporte, cultura e economia regional.",
    image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80"
  },
  {
    year: "2020s",
    title: "Do papel para o digital",
    text: "Com novas plataformas, o Informativo Regional passou a integrar jornal impresso, redes sociais e portal, mantendo a mesma essência editorial e maior agilidade.",
    image: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1400&q=80"
  },
  {
    year: "Hoje",
    title: "Um jornal em evolução contínua",
    text: "Atualmente, seguimos construindo uma experiência moderna para leitura das edições, acesso às últimas matérias e relacionamento direto com o público da nossa região.",
    image: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1400&q=80"
  }
];

export default function SobrePage(): JSX.Element {
  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-8">
        <div className="overflow-hidden rounded-3xl border border-zinc-300 bg-zinc-900 text-white shadow-2xl dark:border-zinc-700">
          <div className="relative min-h-[320px]">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1800&q=80)" }} />
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/20" />
            <div className="relative z-10 p-7 md:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Nossa trajetória</p>
              <h1 className="mt-2 max-w-3xl font-editorial text-5xl leading-tight">Sobre o Informativo Regional</h1>
              <p className="mt-4 max-w-2xl text-sm text-zinc-200">
                De um jornal de proximidade para uma plataforma regional de informação: seguimos contando a história da nossa gente com credibilidade, memória e inovação.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            O Informativo Regional construiu sua identidade acompanhando o ritmo de São João do Sul e municípios vizinhos. Ao longo dos anos, o compromisso editorial permaneceu o mesmo:
            informar com clareza, valorizar histórias locais e aproximar a comunidade dos temas que impactam seu cotidiano.
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {historyBlocks.map((block, idx) => (
            <article key={block.title} className={`grid items-center gap-5 rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 md:p-5 ${idx % 2 === 0 ? "lg:grid-cols-[1.05fr_1fr]" : "lg:grid-cols-[1fr_1.05fr]"}`}>
              <div className={idx % 2 === 0 ? "" : "lg:order-2"}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--site-accent)]">{block.year}</p>
                <h2 className="mt-2 font-editorial text-3xl">{block.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{block.text}</p>
              </div>
              <div className={`${idx % 2 === 0 ? "" : "lg:order-1"} overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700`}>
                <div className="h-64 w-full bg-cover bg-center md:h-72" style={{ backgroundImage: `url(${block.image})` }} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
