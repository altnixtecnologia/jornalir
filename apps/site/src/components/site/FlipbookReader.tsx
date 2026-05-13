"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();

interface FlipbookReaderProps {
  pdfUrl: string;
  title: string;
  zoomPercent: number;
}

interface RenderedPage {
  index: number;
  imageUrl: string;
}

const PdfPage = forwardRef<HTMLDivElement, { page: RenderedPage }>(({ page }, ref) => {
  return (
    <div ref={ref} className="h-full w-full bg-white p-2">
      <div className="h-full w-full overflow-hidden rounded border border-zinc-300 bg-white">
        <img src={page.imageUrl} alt={`Página ${page.index + 1}`} className="h-full w-full object-contain" />
      </div>
    </div>
  );
});

PdfPage.displayName = "PdfPage";

export function FlipbookReader({ pdfUrl, title, zoomPercent }: FlipbookReaderProps): JSX.Element {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const renderScale = 2.2;
  const visualScale = useMemo(() => Math.max(0.7, Math.min(1.8, zoomPercent / 100)), [zoomPercent]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        setError(null);
        setPages([]);
        const loadingTask = getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const nextPages: RenderedPage[] = [];

        for (let i = 1; i <= pdf.numPages; i += 1) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: renderScale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          nextPages.push({ index: i - 1, imageUrl: canvas.toDataURL("image/jpeg", 0.9) });
        }

        if (!cancelled) {
          setPages(nextPages);
        }
      } catch {
        if (!cancelled) {
          setError("Não foi possível gerar o modo revista desta edição.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  if (error) {
    return (
      <div className="rounded-xl border border-zinc-300 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        {error}
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-300 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        Preparando modo revista...
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-zinc-300 bg-zinc-100 p-3 dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex min-w-max justify-center" style={{ transform: `scale(${visualScale})`, transformOrigin: "top center" }}>
        <HTMLFlipBook
        width={430}
        height={620}
        size="stretch"
        minWidth={280}
        maxWidth={980}
        minHeight={400}
        maxHeight={1200}
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
      >
        {pages.map((page) => (
          <PdfPage key={`${title}-${page.index}`} page={page} />
        ))}
      </HTMLFlipBook>
      </div>
    </div>
  );
}
