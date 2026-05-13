import Link from "next/link";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { calameoEditions } from "../../../components/site/calameoEditions";

export default function JornalOnlinePage(): JSX.Element {
  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-7">
        <h1 className="font-editorial text-4xl">Jornal Online</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-300">Acervo digital com leitor interno, sem sair do site.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {calameoEditions.map((edition, idx) => {
            return (
              <article key={edition.id} className="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="mb-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
                  <div className="relative aspect-[3/4] w-full overflow-hidden">
                    <embed
                      src={`${edition.pdfPath}#page=1&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0`}
                      type="application/pdf"
                      className="pointer-events-none h-full w-full"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-2 text-center text-xs font-semibold tracking-wider text-white">
                      CAPA
                    </div>
                  </div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{edition.category}</p>
                <h3 className="mt-1 text-base font-semibold">{edition.title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{edition.dateLabel}</p>
                <div className="mt-4 flex gap-2">
                  <Link href={`/jornal-online/${edition.id}`} className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                    Ler Edição
                  </Link>
                  <Link href={edition.pdfPath} target="_blank" className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">
                    Abrir PDF
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
