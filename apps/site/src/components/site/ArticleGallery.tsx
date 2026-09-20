"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import type { ArticleImage } from "./siteArticleTypes";

const SWIPE_THRESHOLD_PX = 40;

/**
 * Galeria de matéria com várias fotos: grade no desktop, faixa com
 * scroll-snap no mobile (fácil de arrastar com o dedo, sem biblioteca
 * externa), e um visualizador em tela cheia — setas no desktop, teclado,
 * swipe no mobile, contador "1/3", legenda e crédito por foto. Só aparece
 * quando há 2 ou mais fotos no total (capa + galeria); com apenas a capa,
 * nada disto é exibido.
 */
export function ArticleGallery({ images }: { images: ArticleImage[] }): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpenIndex(null);
      if (event.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
      if (event.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    }
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [openIndex, images.length]);

  if (images.length === 0) return <></>;

  const active = openIndex !== null ? images[openIndex] : null;

  function goPrev(): void {
    setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
  }
  function goNext(): void {
    setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
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
      <p className="kicker mb-3">Galeria · {images.length} foto{images.length > 1 ? "s" : ""}</p>

      {/* Desktop */}
      <div className="hidden article-gallery-grid md:grid">
        {images.map((image, i) => (
          <button type="button" key={image.url + i} onClick={() => setOpenIndex(i)} aria-label={`Ampliar foto ${i + 1} de ${images.length}`}>
            <img src={image.url} alt={image.caption ?? ""} loading="lazy" />
          </button>
        ))}
      </div>

      {/* Mobile */}
      <div className="article-gallery-scroll md:hidden">
        {images.map((image, i) => (
          <button
            type="button"
            key={image.url + i}
            onClick={() => setOpenIndex(i)}
            aria-label={`Ampliar foto ${i + 1} de ${images.length}`}
            className="relative aspect-[4/3] overflow-hidden rounded-md"
          >
            <img src={image.url} alt={image.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>

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
            <button type="button" className="lightbox-close" onClick={() => setOpenIndex(null)} aria-label="Fechar">
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

          <img src={active.url} alt={active.caption ?? ""} />

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
