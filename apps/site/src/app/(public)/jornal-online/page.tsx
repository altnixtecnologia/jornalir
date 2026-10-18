"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { calameoEditions } from "../../../components/site/calameoEditions";

interface OnlineEdition {
  id: string;
  title: string;
  dateLabel: string;
  category: string;
  pdfPath: string;
  sourceUrl?: string;
  coverUrl?: string;
  pageCount?: number;
  archiveProvider?: string;
}

export default function JornalOnlinePage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [remoteEditions, setRemoteEditions] = useState<OnlineEdition[]>([]);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("Carregando…");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const archiveResponse = await fetch("/api/jornal-online/editions", { cache: "no-store" });
        const archiveData = (await archiveResponse.json()) as { ok?: boolean; items?: OnlineEdition[] };
        if (archiveData?.ok && Array.isArray(archiveData.items) && archiveData.items.length > 0) {
          setRemoteEditions(archiveData.items);
          setSourceLabel("Acervo oficial");
          return;
        }

        const driveResponse = await fetch("/api/jornal-online/drive", { cache: "no-store" });
        const driveData = (await driveResponse.json()) as { ok?: boolean; items?: OnlineEdition[] };
        if (driveData?.ok && Array.isArray(driveData.items) && driveData.items.length > 0) {
          setRemoteEditions(driveData.items);
          setSourceLabel("Acervo legado");
          return;
        }

        setSourceLabel("Acervo local");
      } catch {
        setSourceLabel("Acervo local");
      } finally {
        setRemoteLoaded(true);
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

  const sourceEditions: OnlineEdition[] =
    remoteEditions.length > 0 ? remoteEditions : calameoEditions.map((edition) => ({ ...edition }));

  const editions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceEditions;
    return sourceEditions.filter((edition) => {
      return `${edition.title} ${edition.category} ${edition.dateLabel}`.toLowerCase().includes(q);
    });
  }, [query, sourceEditions]);

  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <section className="site-shell py-5 md:py-7">
        <div
          className="rounded-2xl border p-4 shadow-sm md:p-5"
          style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-editorial text-2xl md:text-4xl">Jornal Online</h1>
            <p className="text-xs" style={{ color: "var(--site-muted)" }}>
              {remoteLoaded ? sourceLabel : "Carregando…"}
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <label
              className="group flex items-center gap-2 rounded-xl border px-3 py-2.5 focus-within:border-[color:var(--brand-red)]"
              style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
            >
              <span className="text-base" style={{ color: "var(--site-muted)" }}>🔎</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar edição por número, título ou categoria"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[color:var(--site-muted)]"
              />
            </label>
          </div>

          <p className="mt-3 text-xs font-medium" style={{ color: "var(--site-muted)" }}>
            {editions.length} edição(ões) encontrada(s)
          </p>
        </div>

        {editions.length === 0 ? (
          <div
            className="mt-6 rounded-xl border p-6 text-center"
            style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
          >
            <h2 className="text-xl font-semibold">Nenhuma edição encontrada</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--site-muted)" }}>Tente outro termo de busca.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {editions.map((edition) => (
              <article
                key={edition.id}
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
              >
                <div
                  className="mb-3 overflow-hidden rounded-lg border"
                  style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }}
                >
                  <div className="group relative aspect-[3/4] w-full overflow-hidden">
                    <Link href={`/jornal-online/${edition.id}`} aria-label={`Ler ${edition.title}`} className="absolute inset-0 z-10">
                      <span className="sr-only">Ler {edition.title}</span>
                    </Link>
                    {edition.coverUrl ? (
                      <img
                        src={edition.coverUrl}
                        alt={`Capa da ${edition.title}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : edition.id.startsWith("drive-") || edition.archiveProvider === "drive" ? (
                      <div
                        className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center"
                        style={{ background: "var(--brand-navy)" }}
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-10 w-10 text-white/80"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M6 2.5h9l3 3V21a0.5.5 0 0 1-.5.5h-11A0.5.5 0 0 1 6 21V3a0.5.5 0 0 1 .5-.5Z" />
                          <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5" />
                        </svg>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                          Informativo Regional
                        </p>
                        <p className="line-clamp-2 text-sm font-semibold text-white">{edition.title}</p>
                      </div>
                    ) : (
                      <embed
                        src={`${edition.pdfPath}#page=1&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0`}
                        type="application/pdf"
                        className="pointer-events-none h-full w-full"
                        aria-hidden="true"
                      />
                    )}
                    {/* Botões sobrepostos na capa (clicar na capa também abre a edição) —
                        scrim escuro + contorno/sombra garantem contraste em qualquer cor de capa. */}
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 p-2.5"
                      style={{ background: "linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0) 85%)" }}
                    >
                      <Link
                        href={`/jornal-online/${edition.id}`}
                        className="pointer-events-auto rounded-md px-2.5 py-1.5 text-xs font-bold text-white shadow-[0_1px_3px_rgba(0,0,0,.6)] ring-1 ring-white/40"
                        style={{ background: "var(--brand-navy)" }}
                      >
                        Ler edição
                      </Link>
                      <Link
                        href={edition.sourceUrl ?? edition.pdfPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pointer-events-auto rounded-md bg-white/90 px-2.5 py-1.5 text-xs font-bold text-black shadow-[0_1px_3px_rgba(0,0,0,.6)] ring-1 ring-black/10"
                      >
                        PDF
                      </Link>
                    </div>
                  </div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--site-muted)" }}>
                  {edition.category}
                </p>
                <h3 className="mt-1 text-base font-semibold">{edition.title}</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--site-muted)" }}>{edition.dateLabel}</p>
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
          className="fixed bottom-5 right-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full text-xl font-bold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ background: "var(--brand-navy)" }}
        >
          ↑
        </button>
      ) : null}
    </main>
  );
}
