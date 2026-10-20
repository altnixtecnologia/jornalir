"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { ArticleImage } from "./siteArticleTypes";

const MAX_ZOOM = 5;
const DOUBLE_TAP_MS = 300;
const SWIPE_THRESHOLD_PX = 48;
type Point = { x: number; y: number };
type Zoom = { scale: number; x: number; y: number };
const INITIAL_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Pan must never expose a blank gap beyond the actual image borders.
 * Size is the viewport STAGE; the source image is fitted with object-fit:contain.
 */
function clampZoom(value: Zoom, stage: HTMLElement | null, image: HTMLImageElement | null): Zoom {
  const scale = Math.max(1, Math.min(MAX_ZOOM, value.scale));
  if (scale === 1 || !stage || !image?.naturalWidth || !image.naturalHeight) return INITIAL_ZOOM;
  const box = stage.getBoundingClientRect();
  const w = box.width, h = box.height;
  if (!w || !h) return { scale, x: 0, y: 0 };
  const fit = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const scaledW = image.naturalWidth * fit * scale;
  const scaledH = image.naturalHeight * fit * scale;
  const maxX = Math.max(0, (scaledW - w) / 2);
  const maxY = Math.max(0, (scaledH - h) / 2);
  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, value.x)),
    y: Math.max(-maxY, Math.min(maxY, value.y)),
  };
}

type PointerStart = { x: number; y: number; startedAt: number };
type PinchStart = {
  distance: number; scale: number; x: number; y: number; center: Point;
};

export function ArticleGallery({
  images,
  thumbnailStart,
  openIndex,
  onOpenIndexChange,
}: {
  images: ArticleImage[];
  thumbnailStart: number;
  openIndex: number | null;
  onOpenIndexChange: (index: number | null) => void;
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const zoomRef = useRef<Zoom>(INITIAL_ZOOM);
  const [zoom, setZoom] = useState<Zoom>(INITIAL_ZOOM);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<PinchStart | null>(null);
  const swipeStartRef = useRef<PointerStart | null>(null);
  const panLastRef = useRef<Point | null>(null);
  const lastTapRef = useRef<{ at: number; point: Point } | null>(null);
  const hadMultiplePointersRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const thumbnails = images.slice(thumbnailStart);

  function updateZoom(next: Zoom): void {
    const limited = clampZoom(next, stageRef.current, imageRef.current);
    zoomRef.current = limited;
    setZoom(limited);
  }

  function resetZoom(): void {
    zoomRef.current = INITIAL_ZOOM;
    setZoom(INITIAL_ZOOM);
    pointersRef.current.clear();
    pinchRef.current = null;
    swipeStartRef.current = null;
    panLastRef.current = null;
    lastTapRef.current = null;
    hadMultiplePointersRef.current = false;
  }

  function goTo(next: number): void {
    if (!images.length) return;
    resetZoom();
    onOpenIndexChange((next + images.length) % images.length);
  }

  function openPhoto(index: number): void {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resetZoom();
    onOpenIndexChange(index);
  }

  function closePhoto(): void {
    resetZoom();
    onOpenIndexChange(null);
  }

  // Changing images must never carry zoom or translation to the next photo.
  useEffect(() => {
    zoomRef.current = INITIAL_ZOOM;
    setZoom(INITIAL_ZOOM);
    pointersRef.current.clear();
    pinchRef.current = null;
    swipeStartRef.current = null;
    panLastRef.current = null;
    hadMultiplePointersRef.current = false;
  }, [openIndex]);

  useEffect(() => {
    if (openIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    closeButtonRef.current?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") { event.preventDefault(); closePhoto(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); goTo(openIndex + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(openIndex - 1); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomBy(1.5); }
      else if (event.key === "-") { event.preventDefault(); zoomBy(1 / 1.5); }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      // Called on close and on image changes: avoid scrolling the article on changes.
      if (openIndex !== null && returnFocusRef.current) {
        // Restoring focus only matters after the lightbox closes.
      }
    };
    // goTo/zoomBy intentionally use the fresh active index at each effect rerun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex, images.length, onOpenIndexChange]);

  useEffect(() => {
    if (openIndex !== null) return;
    const previouslyFocused = returnFocusRef.current;
    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus({ preventScroll: true });
    }
    returnFocusRef.current = null;
  }, [openIndex]);

  // Landscape/portrait and the browser's dynamic toolbars change the stage.
  // Keep zoom but clamp translations against the newly available space.
  useEffect(() => {
    if (openIndex === null || !stageRef.current) return;
    const resize = () => updateZoom(zoomRef.current);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(stageRef.current);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex]);

  // Preload adjacent photos without downloading the entire gallery of 30+.
  useEffect(() => {
    if (openIndex === null || images.length < 2) return;
    const adjacent = [
      images[(openIndex + 1) % images.length],
      images[(openIndex - 1 + images.length) % images.length],
    ];
    for (const item of adjacent) {
      if (item?.url) {
        const preload = new Image();
        preload.src = item.url;
      }
    }
  }, [openIndex, images]);

  function zoomAt(nextScale: number, point?: Point): void {
    const stage = stageRef.current;
    if (!stage) return;
    const previous = zoomRef.current;
    const target = Math.max(1, Math.min(MAX_ZOOM, nextScale));
    if (target <= 1) { updateZoom(INITIAL_ZOOM); return; }
    const rect = stage.getBoundingClientRect();
    const focus = point ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const cx = focus.x - rect.left - rect.width / 2;
    const cy = focus.y - rect.top - rect.height / 2;
    const ratio = target / previous.scale;
    updateZoom({ scale: target, x: cx - (cx - previous.x) * ratio, y: cy - (cy - previous.y) * ratio });
  }
  function zoomBy(factor: number): void {
    zoomAt(zoomRef.current.scale * factor);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const p = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, p);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size >= 2) {
      hadMultiplePointersRef.current = true;
      swipeStartRef.current = null;
      panLastRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.max(1, distance(a, b)),
        scale: zoomRef.current.scale,
        x: zoomRef.current.x,
        y: zoomRef.current.y,
        center: midpoint(a, b),
      };
    } else {
      swipeStartRef.current = { ...p, startedAt: Date.now() };
      panLastRef.current = p;
      hadMultiplePointersRef.current = false;
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!pointersRef.current.has(event.pointerId)) return;
    const p = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, p);
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const currentCenter = midpoint(a, b);
      const start = pinchRef.current;
      const scale = Math.max(1, Math.min(MAX_ZOOM, start.scale * distance(a, b) / start.distance));
      const ratio = scale / start.scale;
      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage) return;
      const centerX = currentCenter.x - stage.left - stage.width / 2;
      const centerY = currentCenter.y - stage.top - stage.height / 2;
      const startX = start.center.x - stage.left - stage.width / 2;
      const startY = start.center.y - stage.top - stage.height / 2;
      updateZoom({
        scale,
        x: centerX - (startX - start.x) * ratio,
        y: centerY - (startY - start.y) * ratio,
      });
      return;
    }
    if (pointersRef.current.size === 1 && zoomRef.current.scale > 1 && panLastRef.current) {
      const dx = p.x - panLastRef.current.x;
      const dy = p.y - panLastRef.current.y;
      updateZoom({ ...zoomRef.current, x: zoomRef.current.x + dx, y: zoomRef.current.y + dy });
    }
    panLastRef.current = p;
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (hadMultiplePointersRef.current) {
      pinchRef.current = null;
      swipeStartRef.current = null;
      const remaining = [...pointersRef.current.values()];
      panLastRef.current = remaining[0] ?? null;
      if (remaining.length === 0) hadMultiplePointersRef.current = false;
      return;
    }
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    panLastRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (zoomRef.current.scale === 1 && images.length > 1 &&
        Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      goTo((openIndex ?? 0) + (dx < 0 ? 1 : -1));
      return;
    }
    if (event.pointerType === "mouse" || Math.hypot(dx, dy) > 18 || Date.now() - start.startedAt > 350) return;
    const now = Date.now();
    const point = { x: event.clientX, y: event.clientY };
    if (lastTapRef.current && now - lastTapRef.current.at < DOUBLE_TAP_MS &&
        distance(lastTapRef.current.point, point) < 36) {
      zoomAt(zoomRef.current.scale > 1 ? 1 : 2.5, point);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { at: now, point };
    }
  }
  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    swipeStartRef.current = null;
    panLastRef.current = null;
    hadMultiplePointersRef.current = pointersRef.current.size > 0;
  }

  const active = openIndex === null ? null : images[openIndex] ?? null;
  return (
    <div>
      {thumbnails.length > 0 ? (
        <>
          <p className="kicker mb-3">Galeria · {images.length} foto{images.length > 1 ? "s" : ""}</p>
          <div className="hidden article-gallery-grid md:grid">
            {thumbnails.map((image, i) => {
              const index = thumbnailStart + i;
              return <button type="button" key={image.url + index} onClick={() => openPhoto(index)}
                aria-label={"Ampliar foto " + (index + 1) + " de " + images.length}>
                <img src={image.url} alt={image.caption ?? ""} loading="lazy" className="h-full w-full object-contain" />
              </button>;
            })}
          </div>
          <div className="article-gallery-scroll md:hidden">
            {thumbnails.map((image, i) => {
              const index = thumbnailStart + i;
              return <button type="button" key={image.url + index} onClick={() => openPhoto(index)}
                aria-label={"Ampliar foto " + (index + 1) + " de " + images.length}
                className="relative aspect-[4/3] overflow-hidden rounded-md bg-[color:var(--site-bg)]">
                <img src={image.url} alt={image.caption ?? ""} className="h-full w-full object-contain" loading="lazy" />
              </button>;
            })}
          </div>
        </>
      ) : null}

      {active && typeof document !== "undefined" ? createPortal(
        <div className="lightbox-backdrop" role="dialog" aria-modal="true"
          aria-label="Visualizador de fotografias do Jornal IR">
          <div ref={stageRef} className="lightbox-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onDoubleClick={(event) => {
              // Desktop double-click; touch double tap is handled in onPointerUp.
              if (event.detail === 2) zoomAt(zoomRef.current.scale > 1 ? 1 : 2.5, { x: event.clientX, y: event.clientY });
            }}>
            <img key={active.url + String(openIndex)} ref={imageRef}
              src={active.url} alt={active.caption ?? "Fotografia da matéria"}
              className="lightbox-image" draggable={false}
              onLoad={() => updateZoom(zoomRef.current)}
              style={{
                transform: "translate3d(" + zoom.x + "px, " + zoom.y + "px, 0) scale(" + zoom.scale + ")",
                cursor: zoom.scale > 1 ? "grab" : "zoom-in",
              }}
            />
          </div>
          <div className="lightbox-topbar">
            <span className="lightbox-counter">{(openIndex ?? 0) + 1} / {images.length}</span>
            <div className="lightbox-controls">
              <button type="button" aria-label="Reduzir zoom" disabled={zoom.scale <= 1}
                onClick={() => zoomBy(1 / 1.5)}>−</button>
              <span className="lightbox-zoom-label" aria-live="off">{Math.round(zoom.scale * 100)}%</span>
              <button type="button" aria-label="Ampliar zoom" disabled={zoom.scale >= MAX_ZOOM}
                onClick={() => zoomBy(1.5)}>+</button>
              <button type="button" className="lightbox-close" ref={closeButtonRef}
                onClick={closePhoto} aria-label="Fechar visualizador">✕</button>
            </div>
          </div>
          {images.length > 1 ? (
            <>
              <button type="button" className="lightbox-nav prev" onClick={() => goTo((openIndex ?? 0) - 1)}
                aria-label="Foto anterior">‹</button>
              <button type="button" className="lightbox-nav next" onClick={() => goTo((openIndex ?? 0) + 1)}
                aria-label="Próxima foto">›</button>
            </>
          ) : null}
          <p className="lightbox-hint" aria-hidden="true">
            {zoom.scale > 1 ? "Arraste para explorar · toque duas vezes para reduzir" :
              "Aproxime os dedos ou toque duas vezes para ampliar" }
          </p>
          {active.caption || active.credit ? (
            <div className="lightbox-caption">
              {active.caption ? <p>{active.caption}</p> : null}
              {active.credit ? <span>Crédito: {active.credit}</span> : null}
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
