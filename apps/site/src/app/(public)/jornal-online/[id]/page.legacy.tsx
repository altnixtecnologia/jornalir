"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { calameoEditions } from "../../../../components/site/calameoEditions";

export default function JornalOnlineReaderPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [page, setPage] = useState(1);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const frameWrapRef = useRef<HTMLDivElement | null>(null);

  const edition = useMemo(() => calameoEditions.find((item) => item.id === id), [id]);
  const maxPage = edition?.pageCount ?? 99;
  const iframeSrc = edition
    ? `${edition.pdfPath}#page=${page}&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0`
    : "";

  function prevPage(): void {
    setPage((p) => Math.max(1, p - 1));
  }

  function nextPage(): void {
    setPage((p) => Math.min(maxPage, p + 1));
  }

  function onTouchStart(x: number): void {
    setTouchStartX(x);
  }

  function onTouchEnd(x: number): void {
    if (touchStartX === null) return;
    const delta = x - touchStartX;
    if (delta > 45) prevPage();
    if (delta < -45) nextPage();
    setTouchStartX(null);
  }

  async function toggleFullscreen(): Promise<void> {
    const el = frameWrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  }

  if (!edition) {
    return (
      <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
        <SiteHeader />
        <section className="site-shell py-7">
          <h1 className="font-editorial text-4xl">Edição não encontrada</h1>
          <Link href="/jornal-online" className="mt-4 inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            Voltar ao acervo
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{edition.category}</p>
            <h1 className="font-editorial text-2xl">{edition.title}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{edition.dateLabel}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/jornal-online" className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">
              Voltar ao acervo
            </Link>
            <Link href={edition.pdfPath} target="_blank" className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">
              Abrir PDF
            </Link>
            <button type="button" onClick={toggleFullscreen} className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">
              Tela cheia
            </button>
            {edition.sourceUrl ? (
              <Link href={edition.sourceUrl} target="_blank" className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                Fonte Calaméo
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-center gap-2">
          <button type="button" onClick={prevPage} className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">← Página anterior</button>
          <span className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Página {page} de {maxPage}</span>
          <button type="button" onClick={nextPage} className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Próxima página →</button>
        </div>

        <div
          ref={frameWrapRef}
          className="overflow-hidden rounded-xl border border-zinc-300 bg-black dark:border-zinc-700"
          onTouchStart={(e) => onTouchStart(e.changedTouches[0]?.clientX ?? 0)}
          onTouchEnd={(e) => onTouchEnd(e.changedTouches[0]?.clientX ?? 0)}
        >
          <iframe
            key={`${edition.id}-${page}`}
            src={iframeSrc}
            title={edition.title}
            className="h-[78vh] w-full bg-white"
            allowFullScreen
          />
        </div>
        <p className="mt-2 text-center text-xs text-zinc-500">No celular, arraste para esquerda/direita para trocar de página.</p>
      </section>
    </main>
  );
}
