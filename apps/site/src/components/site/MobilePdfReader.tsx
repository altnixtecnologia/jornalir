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
        // Ao sair da janela de pré-carregamento, desmontar o canvas.
        // Caso contrário a leitura de dezenas de páginas esgota a RAM Android.
        setNearViewport(entry.isIntersecting);
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
      try {
        const page = await pdf.getPage(index + 1);
        if (cancelled) return;

        // Limitar o canvas para não esgotar a memória no WebView Android
        // durante o zoom de páginas grandes.
        const base = page.getViewport({ scale: 1 });
        const maxScale = Math.sqrt(8_000_000 / Math.max(1, base.width * base.height));
        const viewport = page.getViewport({ scale: Math.min(1.55 * zoom, maxScale) });
        const ratio = viewport.height / viewport.width;
        setAspectRatio((current) => Math.abs(current - ratio) < 0.001 ? current : ratio);

        // Renderizar fora da tela primeiro: não apagar/reescalar o canvas
        // visível enquanto o PDF.js prepara o próximo nível de zoom.
        const buffer = document.createElement("canvas");
        buffer.width = Math.ceil(viewport.width);
        buffer.height = Math.ceil(viewport.height);
        const bufferContext = buffer.getContext("2d", { alpha: false });
        if (!bufferContext || !canvasRef.current) return;
        renderTask = page.render({ canvasContext: bufferContext, viewport });
        await renderTask.promise;
        if (cancelled) return;

        const visible = canvasRef.current;
        const visibleContext = visible?.getContext("2d", { alpha: false });
        if (!visible || !visibleContext) return;
        // Limpar e desenhar acontece sincronamente no mesmo frame; a
        // imagem antiga permanece visível até esta substituição.
        visible.width = buffer.width;
        visible.height = buffer.height;
        visibleContext.drawImage(buffer, 0, 0);
      } catch (error) {
        if (!cancelled) {
          console.warn("Não foi possível atualizar a nitidez desta página do PDF.", error);
        }
      }
    }

    // A pinça atualiza apenas CSS enquanto se move; esperar uma pausa curta
    // evita re-renderizar dezenas de páginas a cada ajuste do zoom.
    const timer = window.setTimeout(() => { void render(); }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
        // A largura usa uma variável atualizada durante a pinça, sem forçar
        // nova renderização PDF.js a cada movimento do dedo.
        width: "var(--ir-pdf-display-width, 100%)",
        maxWidth: "none",
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

export function MobilePdfReader({ pdfUrl, title, fullscreen = false }: { pdfUrl: string; title: string; fullscreen?: boolean }): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const pinchRef = useRef<{
    distance: number;
    startZoom: number;
    displayZoom: number;
    anchorX: number;
    anchorY: number;
    contentX: number;
    contentY: number;
  } | null>(null);

  // Zoom de tela e zoom de renderização são separados: ao mover os dedos,
  // só alteramos o tamanho CSS; PDF.js renderiza em alta definição uma vez
  // quando a pinça termina. Evita telas brancas/piscadas no Android.
  useEffect(() => {
    zoomRef.current = zoom;
    pagesRef.current?.style.setProperty("--ir-pdf-display-width", `${zoom * 100}%`);
  }, [zoom, pdf]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const pages = pagesRef.current;
    if (!viewport || !pages || !pdf) return;

    const distanceBetween = (touches: TouchList): number => {
      const x = touches[0].clientX - touches[1].clientX;
      const y = touches[0].clientY - touches[1].clientY;
      return Math.hypot(x, y);
    };

    let lastTap: { time: number; x: number; y: number } | null = null;
    let singleTouchStart: { x: number; y: number; moved: boolean } | null = null;

    const startPinch = (event: TouchEvent): void => {
      if (event.touches.length !== 2) return;
      lastTap = null;
      singleTouchStart = null;
      const bounds = viewport.getBoundingClientRect();
      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - bounds.left;
      const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - bounds.top;
      const currentZoom = zoomRef.current;
      pinchRef.current = {
        distance: Math.max(1, distanceBetween(event.touches)),
        startZoom: currentZoom,
        displayZoom: currentZoom,
        anchorX: centerX,
        anchorY: centerY,
        contentX: (viewport.scrollLeft + centerX) / currentZoom,
        contentY: (viewport.scrollTop + centerY) / currentZoom,
      };
    };

    const movePinch = (event: TouchEvent): void => {
      if (event.touches.length !== 2) return;
      if (!pinchRef.current) startPinch(event);
      const state = pinchRef.current;
      if (!state) return;
      // Listener nativo não passivo: impedir zoom do WebView, que ampliaria
      // todo o site em vez de ampliar as páginas do jornal.
      if (event.cancelable) event.preventDefault();
      const nextZoom = Math.max(1, Math.min(3, state.startZoom * distanceBetween(event.touches) / state.distance));
      state.displayZoom = nextZoom;
      pages.style.setProperty("--ir-pdf-display-width", `${nextZoom * 100}%`);
      viewport.scrollLeft = state.contentX * nextZoom - state.anchorX;
      viewport.scrollTop = state.contentY * nextZoom - state.anchorY;
    };

    const finishPinch = (event: TouchEvent): void => {
      if (event.touches.length >= 2 || !pinchRef.current) return;
      const finished = pinchRef.current;
      pinchRef.current = null;
      const nextZoom = Number(finished.displayZoom.toFixed(2));
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
    };

    const onTouchStart = (event: TouchEvent): void => {
      if (event.touches.length === 2) {
        startPinch(event);
      } else if (event.touches.length === 1) {
        const touch = event.touches[0];
        singleTouchStart = { x: touch.clientX, y: touch.clientY, moved: false };
      }
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (event.touches.length === 2) {
        movePinch(event);
      } else if (event.touches.length === 1 && singleTouchStart) {
        const touch = event.touches[0];
        if (Math.hypot(touch.clientX - singleTouchStart.x, touch.clientY - singleTouchStart.y) > 12) {
          singleTouchStart.moved = true;
        }
      }
    };

    const onTouchEnd = (event: TouchEvent): void => {
      const wasPinching = pinchRef.current !== null;
      finishPinch(event);
      if (wasPinching || event.touches.length > 0) {
        singleTouchStart = null;
        lastTap = null;
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch || !singleTouchStart || singleTouchStart.moved) {
        singleTouchStart = null;
        lastTap = null;
        return;
      }
      singleTouchStart = null;
      const now = Date.now();
      const isDoubleTap = lastTap !== null
        && now - lastTap.time <= 320
        && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) <= 32;
      if (!isDoubleTap) {
        lastTap = { time: now, x: touch.clientX, y: touch.clientY };
        return;
      }

      lastTap = null;
      if (event.cancelable) event.preventDefault();
      const previousZoom = zoomRef.current;
      const nextZoom = previousZoom < 1.25 ? 1.5 : 1;
      const bounds = viewport.getBoundingClientRect();
      const x = touch.clientX - bounds.left;
      const y = touch.clientY - bounds.top;
      const contentX = (viewport.scrollLeft + x) / previousZoom;
      const contentY = (viewport.scrollTop + y) / previousZoom;
      zoomRef.current = nextZoom;
      pages.style.setProperty("--ir-pdf-display-width", `${nextZoom * 100}%`);
      setZoom(nextZoom);
      window.requestAnimationFrame(() => {
        if (!viewport.isConnected) return;
        viewport.scrollLeft = contentX * nextZoom - x;
        viewport.scrollTop = contentY * nextZoom - y;
      });
    };

    const onTouchCancel = (event: TouchEvent): void => {
      finishPinch(event);
      singleTouchStart = null;
      lastTap = null;
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: false });
    viewport.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchCancel);
      pinchRef.current = null;
    };
  }, [pdf]);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    let loadingTask: ReturnType<typeof getDocument> | null = null;

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
        loadingTask=task;
        loaded = await task.promise;
        if (cancelled) {
          void loaded.destroy().catch(()=>undefined);
          return;
        }
        if (!cancelled) {
          setPdf(loaded);
          setPage(1);
          setZoom(1);
        }
      } catch {
        if (!cancelled) setError("Não foi possível carregar esta edição.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy().catch(()=>undefined);
      else if (loaded) void loaded.destroy().catch(()=>undefined);
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
    <section
      aria-label={`Leitor de ${title}`}
      className="rounded-xl border"
      style={{ borderColor: "var(--site-line)", height: fullscreen ? "100%" : undefined, display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <div
        className="sticky z-20 flex items-center justify-between gap-2 border-b px-2 py-2 backdrop-blur"
        style={{
          borderColor: "var(--site-line)",
          background: "rgba(255,255,255,.94)",
          // Abaixo do SiteHeader (sticky top:0 também), não sobre ele —
          // evita duas barras disputando o topo da tela (18/10/2026).
          top: fullscreen ? "0px" : "calc(58px + env(safe-area-inset-top, 0px))",
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

      <div
        ref={viewportRef}
        className="overflow-auto bg-zinc-200 p-2"
        style={{
          maxHeight: fullscreen ? "none" : "82vh",
          flex: fullscreen ? "1 1 auto" : undefined,
          minHeight: 0,
          // Deixa o dedo deslizar, mas a pinça é tratada pelo leitor.
          touchAction: "pan-x pan-y",
          overscrollBehavior: "contain",
        }}
      >
        <div ref={pagesRef} style={{ ["--ir-pdf-display-width" as string]: `${zoom * 100}%` }}>
          {Array.from({ length: pdf.numPages }, (_, index) => (
            <MobilePdfPage key={index} pdf={pdf} index={index} zoom={zoom} onVisible={setPage} />
          ))}
        </div>
      </div>
    </section>
  );
}
