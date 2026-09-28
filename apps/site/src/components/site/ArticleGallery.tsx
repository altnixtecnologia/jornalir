"use client";

import { useEffect, useRef, type TouchEvent } from "react";
import type { ArticleImage } from "./siteArticleTypes";

const SWIPE_THRESHOLD_PX = 40;

/**
 * Galeria de matéria: grade das fotos da galeria (grid no desktop, faixa
 * com scroll-snap no mobile) + um visualizador em tela cheia — setas no
 * desktop, teclado, swipe no mobile, contador e legenda/crédito por foto.
 *
 * Componente CONTROLADO (Fase 49, item 3): `images` é o conjunto UNIFICADO
 * capa + galeria (índice 0 = capa, quando existir) — quem decide QUANDO o
 * lightbox abre e em qual índice é o componente pai (a capa é exibida como
 * hero fora daqui, mas precisa abrir o MESMO visualizador, no índice 0).
 * `thumbnailStart` diz a partir de qual índice desenhar a grade de
 * miniaturas abaixo do corpo (1 quando há capa, para não repetir a capa
 * como miniatura; 0 quando não há capa).
 */
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
  const touchStartX = useRef<number | null>(null);
  const thumbnails = images.slice(thumbnailStart);

  useEffect(() => {
    if (openIndex === null) return;
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onOpenIndexChange(null);
      if (event.key === "ArrowRight") onOpenIndexChange(((openIndex ?? 0) + 1) % images.length);
      if (event.key === "ArrowLeft") onOpenIndexChange(((openIndex ?? 0) - 1 + images.length) % images.length);
    }
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [openIndex, images.length, onOpenIndexChange]);

  const active = openIndex !== null ? images[openIndex] : null;

  function goPrev(): void {
    if (openIndex === null) return;
    onOpenIndexChange((openIndex - 1 + images.length) % images.length);
  }
  function goNext(): void {
    if (openIndex === null) return;
    onOpenIndexChange((openIndex + 1) % images.length);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>): void {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }
  function handleTouchEnd(event: TouchEvent<HTMLDivElement>): void {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (images.length <= 1) return;
    if (delta > SWIPE_THRESHOLD_PX) goPrev();
    else if (delta < -SWIPE_THRESHOLD_PX) goNext();
  }

  return (
    <div>
      {thumbnails.length > 0 ? (
        <>
          <p className="kicker mb-3">Galeria · {images.length} foto{images.length > 1 ? "s" : ""}</p>

          {/* Desktop */}
          <div className="hidden article-gallery-grid md:grid">
            {thumbnails.map((image, i) => {
              const index = thumbnailStart + i;
              return (
                <button type="button" key={image.url + index} onClick={() => onOpenIndexChange(index)} aria-label={`Ampliar foto ${index + 1} de ${images.length}`}>
                  <img src={image.url} alt={image.caption ?? ""} loading="lazy" className="h-full w-full object-contain" />
                </button>
              );
            })}
          </div>

          {/* Mobile */}
          <div className="article-gallery-scroll md:hidden">
            {thumbnails.map((image, i) => {
              const index = thumbnailStart + i;
              return (
                <button
                  type="button"
                  key={image.url + index}
                  onClick={() => onOpenIndexChange(index)}
                  aria-label={`Ampliar foto ${index + 1} de ${images.length}`}
                  className="relative aspect-[4/3] overflow-hidden rounded-md bg-[color:var(--site-bg)]"
                >
                  <img src={image.url} alt={image.caption ?? ""} className="h-full w-full object-contain" loading="lazy" />
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {active ? (
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="lightbox-topbar">
            {images.length > 1 ? (
              <span className="lightbox-counter">
                {(openIndex ?? 0) + 1}/{images.length}
              </span>
            ) : (
              <span />
            )}
            <button type="button" className="lightbox-close" onClick={() => onOpenIndexChange(null)} aria-label="Fechar">
              ✕
            </button>
          </div>

          {images.length > 1 ? (
            <>
              <button type="button" className="lightbox-nav prev" onClick={goPrev} aria-label="Foto anterior">
                ‹
              </button>
              <button type="button" className="lightbox-nav next" onClick={goNext} aria-label="Próxima foto">
                ›
              </button>
            </>
          ) : null}

          <img src={active.url} alt={active.caption ?? ""} className="lightbox-image" />

          {active.caption || active.credit ? (
            <p className="lightbox-caption">
              {active.caption}
              {active.credit ? <span>Crédito: {active.credit}</span> : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
