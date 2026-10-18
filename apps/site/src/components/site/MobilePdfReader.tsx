"use client";

import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();

function MobilePdfPage({
  pdf,
  index,
  zoom,
  onVisible,
}: {
  pdf: PDFDocumentProxy;
  index: number;
  zoom: number;
  onVisible: (page: number) => void;
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [nearViewport, setNearViewport] = useState(index < 2);
  const [aspectRatio, setAspectRatio] = useState(1.414);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) setNearViewport(true);
        if (entry.intersectionRatio >= 0.35) onVisible(index + 1);
      },
      { rootMargin: "900px 0px", threshold: [0, 0.35, 0.7] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [index, onVisible]);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;

    async function render(): Promise<void> {
      const page = await pdf.getPage(index + 1);
      if (cancelled) return;

      const viewport = page.getViewport({ scale: 1.55 * zoom });
      setAspectRatio(viewport.height / viewport.width);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      renderTask = page.render({ canvasContext: context, viewport });
      try {
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) throw error;
      }
    }

    void render();
    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // Renderização já encerrada.
      }
    };
  }, [index, nearViewport, pdf, zoom]);

  return (
    <div
      ref={wrapRef}
      className="mx-auto mb-3 overflow-hidden rounded-md border bg-white shadow-sm"
      style={{
        width: `${Math.round(zoom * 100)}%`,
        maxWidth: zoom <= 1 ? "100%" : "none",
        borderColor: "var(--site-line)",
        minHeight: nearViewport ? undefined : `${Math.round(aspectRatio * 100)}vw`,
      }}
      data-page={index + 1}
    >
      {nearViewport ? (
        <canvas
          ref={canvasRef}
          aria-label={`Página ${index + 1}`}
          className="block h-auto w-full bg-white"
        />
      ) : (
        <div
          className="flex items-center justify-center text-xs"
          style={{
            aspectRatio: `1 / ${aspectRatio}`,
            color: "var(--site-muted)",
          }}
        >
          Página {index + 1}
        </div>
      )}
    </div>
  );
}

export function MobilePdfReader({ pdfUrl, title }: { pdfUrl: string; title: string }): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;

    async function load(): Promise<void> {
      try {
        setError(null);
        setPdf(null);
        const task = getDocument({
          url: pdfUrl,
          disableAutoFetch: false,
          disableStream: false,
          rangeChunkSize: 262144,
        });
        loaded = await task.promise;
        if (!cancelled) {
          setPdf(loaded);
          setPage(1);
        }
      } catch {
        if (!cancelled) setError("Não foi possível carregar esta edição.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [pdfUrl]);

  if (error) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--site-line)", color: "var(--site-muted)" }}>
        {error}
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--site-line)", color: "var(--site-muted)" }}>
        Carregando edição…
      </div>
    );
  }

  return (
    <section aria-label={`Leitor de ${title}`} className="rounded-xl border" style={{ borderColor: "var(--site-line)" }}>
      <div
        className="sticky z-20 flex items-center justify-between gap-2 border-b px-2 py-2 backdrop-blur"
        style={{
          borderColor: "var(--site-line)",
          background: "rgba(255,255,255,.94)",
          // Abaixo do SiteHeader (sticky top:0 também), não sobre ele —
          // evita duas barras disputando o topo da tela (18/10/2026).
          top: "calc(58px + env(safe-area-inset-top, 0px))",
        }}
      >
        <span className="text-xs font-semibold">
          Página {page} de {pdf.numPages}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border px-2 py-1 text-sm font-bold"
            style={{ borderColor: "var(--site-line)" }}
            onClick={() => setZoom((value) => Math.max(1, Number((value - 0.15).toFixed(2))))}
            disabled={zoom <= 1}
            aria-label="Diminuir zoom"
          >
            −
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs font-semibold"
            style={{ borderColor: "var(--site-line)" }}
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 text-sm font-bold"
            style={{ borderColor: "var(--site-line)" }}
            onClick={() => setZoom((value) => Math.min(2, Number((value + 0.15).toFixed(2))))}
            disabled={zoom >= 2}
            aria-label="Aumentar zoom"
          >
            +
          </button>
        </div>
      </div>

      <div className="max-h-[82vh] overflow-auto bg-zinc-200 p-2" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
        {Array.from({ length: pdf.numPages }, (_, index) => (
          <MobilePdfPage key={index} pdf={pdf} index={index} zoom={zoom} onVisible={setPage} />
        ))}
      </div>
    </section>
  );
}
