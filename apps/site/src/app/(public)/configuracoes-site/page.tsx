import { coverageLocations, hotTopics, socialLinks } from "../../../components/site/siteSettings";
import { SiteHeader } from "../../../components/site/SiteHeader";

export default function ConfiguracoesSitePage(): JSX.Element {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="site-shell py-8">
        <h1 className="font-editorial text-4xl">Configuracoes do Site (Mock)</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Pagina de referencia para futuras alteracoes via sistema. Nesta fase, os dados estao em arquivo mock.</p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <article className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
            <h2 className="font-semibold">Redes Sociais</h2>
            <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(socialLinks, null, 2)}</pre>
          </article>

          <article className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
            <h2 className="font-semibold">Locais Atendidos (rotacao)</h2>
            <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(coverageLocations, null, 2)}</pre>
          </article>
        </div>

        <article className="mt-5 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
          <h2 className="font-semibold">Temas Em Alta</h2>
          <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(hotTopics, null, 2)}</pre>
        </article>
      </section>
    </main>
  );
}
