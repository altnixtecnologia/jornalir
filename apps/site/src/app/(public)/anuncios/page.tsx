import { AdsSlotsManager } from "../../../components/site/AdsSlotsManager";
import { SiteHeader } from "../../../components/site/SiteHeader";

export default function AnunciosPatrocinadosPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader active="anuncios" />
      <section className="site-shell py-7">
        <h1 className="font-editorial text-4xl">Painel de Quadros de Propaganda</h1>
        <p className="mt-2 max-w-4xl text-zinc-600 dark:text-zinc-300">
          As imagens sao carregadas direto das pastas em <code>/public/uploads/anuncios</code> (grande1..grande4 e pequena1..pequena3).
          Nesta fase voce ajusta o tempo por quadro e visualiza como cada slot vai rodar no site.
        </p>
        <div className="mt-6">
          <AdsSlotsManager />
        </div>
      </section>
    </main>
  );
}

