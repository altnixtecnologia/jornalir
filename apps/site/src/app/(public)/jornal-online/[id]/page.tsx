"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { calameoEditions } from "../../../../components/site/calameoEditions";

const FlipbookReader = dynamic(
  () => import("../../../../components/site/FlipbookReader").then((m) => m.FlipbookReader),
  { ssr: false }
);

interface DriveEdition {
  id: string;
  title: string;
  dateLabel: string;
  category: string;
  pdfPath: string;
  sourceUrl?: string;
  pageCount?: number;
}

export default function JornalOnlineReaderPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [zoom, setZoom] = useState(100);
  const [driveEditions, setDriveEditions] = useState<DriveEdition[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const mobileFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/jornal-online/drive", { cache: "no-store" });
        const data = (await response.json()) as { ok?: boolean; items?: DriveEdition[] };
        if (data?.ok && Array.isArray(data.items) && data.items.length > 0) {
          setDriveEditions(data.items);
        }
      } catch {
        setDriveEditions([]);
      }
    })();
  }, []);

  useEffect(() => {
    const onResize = (): void => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onScroll = (): void => setShowScrollTop(window.scrollY > 280);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const edition = useMemo(() => {
    return driveEditions.find((item) => item.id === id) ?? calameoEditions.find((item) => item.id === id);
  }, [driveEditions, id]);
  const driveFileId = edition?.id.startsWith("drive-") ? edition.id.replace("drive-", "") : "";
  const pdfRenderUrl = driveFileId ? `/api/jornal-online/drive-file?id=${driveFileId}` : (edition?.pdfPath ?? "");
  const mobileViewerSrc = driveFileId
    ? `https://drive.google.com/file/d/${driveFileId}/preview`
    : `${edition?.pdfPath ?? ""}#page=1&zoom=page-width&toolbar=1&navpanes=0&scrollbar=1`;

  async function toggleFullscreen(): Promise<void> {
    if (isMobile) {
      window.open(edition?.sourceUrl ?? edition?.pdfPath ?? "", "_blank", "noopener,noreferrer");
      return;
    }

    const el = isMobile ? mobileFrameRef.current : frameWrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        return;
      }
      await document.exitFullscreen();
    } catch {
      window.open(edition?.sourceUrl ?? edition?.pdfPath ?? "", "_blank", "noopener,noreferrer");
    }
  }

  function zoomOut(): void {
    setZoom((z) => Math.max(50, z - 10));
  }

  function zoomIn(): void {
    setZoom((z) => Math.min(220, z + 10));
  }

  function resetZoom(): void {
    setZoom(100);
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
            <Link href={edition.sourceUrl ?? edition.pdfPath} target="_blank" className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">
              Abrir PDF
            </Link>
            <button type="button" onClick={toggleFullscreen} className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">
              {isMobile ? "Abrir visualizador" : "Tela cheia"}
            </button>
            {edition.sourceUrl && !edition.id.startsWith("drive-") ? (
              <Link href={edition.sourceUrl} target="_blank" className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                Fonte Calaméo
              </Link>
            ) : null}
          </div>
        </div>

        {isMobile ? (
          <p className="mb-3 text-center text-xs text-zinc-500">No mobile, use o zoom nativo do celular (pinça com dois dedos).</p>
        ) : (
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={zoomOut} className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Zoom -</button>
            <span className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">{zoom}%</span>
            <button type="button" onClick={zoomIn} className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Zoom +</button>
            <button type="button" onClick={resetZoom} className="rounded border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Tamanho inicial</button>
          </div>
        )}

        <div ref={frameWrapRef}>
          {isMobile ? (
            <div className="overflow-hidden rounded-xl border border-zinc-300 bg-black dark:border-zinc-700">
              <iframe
                ref={mobileFrameRef}
                src={mobileViewerSrc}
                title={edition.title}
                className="h-[78vh] w-full bg-white"
                allowFullScreen
              />
            </div>
          ) : (
            <FlipbookReader pdfUrl={pdfRenderUrl} title={edition.title} zoomPercent={zoom} />
          )}
        </div>
        <p className="mt-2 text-center text-xs text-zinc-500">
          {isMobile ? "No celular, leitura em rolagem normal para facilitar a visualização." : "No desktop, deslize/clique para virar as páginas."}
        </p>
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
