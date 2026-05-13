"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { calameoEditions } from "../../../components/site/calameoEditions";

interface DriveEdition {
  id: string;
  title: string;
  dateLabel: string;
  category: string;
  pdfPath: string;
  sourceUrl?: string;
}

export default function JornalOnlinePage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [driveEditions, setDriveEditions] = useState<DriveEdition[]>([]);
  const [driveLoaded, setDriveLoaded] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/jornal-online/drive", { cache: "no-store" });
        const data = (await response.json()) as { ok?: boolean; items?: DriveEdition[] };
        if (data?.ok && Array.isArray(data.items) && data.items.length > 0) {
          setDriveEditions(data.items);
        }
      } finally {
        setDriveLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    const onScroll = (): void => {
      setShowScrollTop(window.scrollY > 320);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sourceEditions = driveEditions.length > 0 ? driveEditions : calameoEditions;
  const latestEdition = sourceEditions[0];

  const editions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceEditions;
    return sourceEditions.filter((edition) => {
      return `${edition.title} ${edition.category} ${edition.dateLabel}`.toLowerCase().includes(q);
    });
  }, [query, sourceEditions]);

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-7">
        <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h1 className="font-editorial text-4xl">Jornal Online</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-300">
            Leitor próprio do Informativo Regional. Acervo interno e pronto para sincronizar com pasta na nuvem.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              Fonte atual: {driveEditions.length > 0 ? "Google Drive (teste automático)" : driveLoaded ? "Acervo local (fallback)" : "Carregando..."}
            </p>
            <Link
              href={latestEdition ? `/jornal-online/${latestEdition.id}` : "/jornal-online"}
              className="text-xs font-semibold text-[color:var(--site-accent)] hover:underline"
            >
              Ler última edição
            </Link>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
            <label className="group flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 focus-within:border-[color:var(--site-accent)] dark:border-zinc-700 dark:bg-zinc-950">
              <span className="text-base text-zinc-500">🔎</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar edição por número, título ou categoria"
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
            </label>
          </div>

          <p className="mt-3 text-xs font-medium text-zinc-500">{editions.length} edição(ões) encontrada(s)</p>
        </div>

        {editions.length === 0 ? (
          <div className="mt-6 rounded-xl border border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Nenhuma edição encontrada</h2>
            <p className="mt-2 text-sm text-zinc-500">Tente outro termo de busca.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {editions.map((edition) => (
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
                    Ler edição
                  </Link>
                  <Link href={edition.sourceUrl ?? edition.pdfPath} target="_blank" className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">
                    PDF
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showScrollTop ? (
        <button
          type="button"
          aria-label="Voltar ao topo"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 right-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700/85 text-xl font-bold text-white shadow-lg transition hover:bg-emerald-700"
        >
          ↑
        </button>
      ) : null}
    </main>
  );
}
