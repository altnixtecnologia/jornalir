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
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  useEffect(() => {
    const onFullscreenChange = (): void => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
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

  const secondaryButtonClass =
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-[color:var(--site-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const secondaryButtonStyle = { borderColor: "var(--site-line)", color: "var(--site-text)" };
  const primaryButtonClass =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const primaryButtonStyle = { background: "var(--brand-navy)" };
  const zoomButtonClass =
    "inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-md px-2 text-sm font-semibold transition hover:bg-[color:var(--site-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

  if (!edition) {
    return (
      <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
        <SiteHeader />
        <section className="site-shell py-7">
          <h1 className="font-editorial text-4xl">Edição não encontrada</h1>
          <Link href="/jornal-online" className={`mt-4 ${primaryButtonClass}`} style={primaryButtonStyle}>
            Voltar ao acervo
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <section className="site-shell py-5">
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
          style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--site-muted)" }}>
              {edition.category}
            </p>
            <h1 className="font-editorial text-2xl">{edition.title}</h1>
            <p className="text-sm" style={{ color: "var(--site-muted)" }}>{edition.dateLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/jornal-online" className={secondaryButtonClass} style={secondaryButtonStyle}>
              Voltar ao acervo
            </Link>
            <Link
              href={edition.sourceUrl ?? edition.pdfPath}
              target="_blank"
              rel="noopener noreferrer"
              className={secondaryButtonClass}
              style={secondaryButtonStyle}
            >
              Abrir PDF
            </Link>
            {edition.sourceUrl && !edition.id.startsWith("drive-") ? (
              <Link
                href={edition.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={secondaryButtonClass}
                style={secondaryButtonStyle}
                aria-label="Abrir fonte original no Calaméo (nova aba)"
              >
                Fonte Calaméo
              </Link>
            ) : null}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={primaryButtonClass}
              style={primaryButtonStyle}
              aria-pressed={isMobile ? undefined : isFullscreen}
            >
              {isMobile ? "Abrir visualizador" : isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            </button>
          </div>
        </div>

        {isMobile ? (
          <p className="mb-3 text-center text-xs" style={{ color: "var(--site-muted)" }}>
            No mobile, use o zoom nativo do celular (pinça com dois dedos).
          </p>
        ) : (
          <div
            className="mb-3 flex w-fit flex-wrap items-center justify-center gap-1 rounded-lg border p-1"
            style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}
            role="group"
            aria-label="Controles de zoom"
          >
            <button type="button" onClick={zoomOut} className={zoomButtonClass} aria-label="Diminuir zoom" title="Diminuir zoom">
              −
            </button>
            <span className="min-w-[3.5rem] px-1 text-center text-sm font-semibold" aria-live="polite">
              {zoom}%
            </span>
            <button type="button" onClick={zoomIn} className={zoomButtonClass} aria-label="Aumentar zoom" title="Aumentar zoom">
              +
            </button>
            <button type="button" onClick={resetZoom} className={`${zoomButtonClass} px-3`} title="Voltar ao tamanho inicial">
              Tamanho inicial
            </button>
          </div>
        )}

        <div ref={frameWrapRef}>
          {isMobile ? (
            <div className="overflow-hidden rounded-xl border bg-black" style={{ borderColor: "var(--site-line)" }}>
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
        <p className="mt-2 text-center text-xs" style={{ color: "var(--site-muted)" }}>
          {isMobile ? "No celular, leitura em rolagem normal para facilitar a visualização." : "No desktop, deslize/clique para virar as páginas."}
        </p>
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
