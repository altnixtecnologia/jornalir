"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();

interface FlipbookReaderProps {
  pdfUrl: string;
  title: string;
  zoomPercent: number;
}

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  index: number;
  active: boolean;
  title: string;
}

const PdfPage = forwardRef<HTMLDivElement, PdfPageProps>(({ pdf, index, active, title }, ref) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function render(): Promise<void> {
      if (!active) {
        setImageUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return null;
        });
        return;
      }

      const page = await pdf.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1.85 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      if (cancelled) return;

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob || cancelled) return;

      createdUrl = URL.createObjectURL(blob);
      setImageUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return createdUrl;
      });
    }

    void render();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [active, index, pdf]);

  return (
    <div ref={ref} className="h-full w-full bg-white p-2">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded border border-zinc-300 bg-white">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${title} — página ${index + 1}`}
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-sm text-zinc-400">Página {index + 1}</div>
        )}
      </div>
    </div>
  );
});

PdfPage.displayName = "PdfPage";

export function FlipbookReader({ pdfUrl, title, zoomPercent }: FlipbookReaderProps): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const visualScale = useMemo(() => Math.max(0.7, Math.min(1.8, zoomPercent / 100)), [zoomPercent]);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;

    async function load(): Promise<void> {
      try {
        setError(null);
        setPdf(null);
        setCurrentPage(0);
        const task = getDocument({
          url: pdfUrl,
          disableAutoFetch: false,
          disableStream: false,
          rangeChunkSize: 262144,
        });
        loaded = await task.promise;
        if (!cancelled) setPdf(loaded);
      } catch {
        if (!cancelled) setError("Não foi possível carregar o modo revista desta edição.");
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
      <div
        role="status"
        className="rounded-xl border p-4 text-sm"
        style={{ borderColor: "var(--site-line)", background: "var(--site-surface)", color: "var(--site-muted)" }}
      >
        {error}
      </div>
    );
  }

  if (!pdf) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border p-4 text-sm"
        style={{ borderColor: "var(--site-line)", background: "var(--site-surface)", color: "var(--site-muted)" }}
      >
        Preparando modo revista…
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border p-3" style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }}>
      <div className="mb-2 text-center text-xs" style={{ color: "var(--site-muted)" }}>
        Página {Math.min(currentPage + 1, pdf.numPages)} de {pdf.numPages}
      </div>
      <div
        className="flex min-w-max justify-center"
        style={{ transform: `scale(${visualScale})`, transformOrigin: "top center" }}
      >
        <HTMLFlipBook
          width={430}
          height={620}
          size="stretch"
          minWidth={280}
          maxWidth={1180}
          minHeight={400}
          maxHeight={1400}
          startPage={0}
          drawShadow
          flippingTime={900}
          usePortrait
          startZIndex={0}
          autoSize
          maxShadowOpacity={0.45}
          showCover={false}
          mobileScrollSupport={false}
          swipeDistance={30}
          showPageCorners
          disableFlipByClick={false}
          clickEventForward
          useMouseEvents
          renderOnlyPageLengthChange
          style={{}}
          className="shadow-2xl"
          onFlip={(event) => setCurrentPage(event.data)}
        >
          {Array.from({ length: pdf.numPages }, (_, index) => (
            <PdfPage
              key={`${title}-${index}`}
              pdf={pdf}
              index={index}
              title={title}
              active={Math.abs(index - currentPage) <= 2}
            />
          ))}
        </HTMLFlipBook>
      </div>
    </div>
  );
}
