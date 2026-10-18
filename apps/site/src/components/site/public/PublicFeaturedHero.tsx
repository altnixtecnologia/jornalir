"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

const DESKTOP_AUTOPLAY_MS = 8_000;
const MOBILE_AUTOPLAY_MS = 16_000;
const SWIPE_THRESHOLD_PX = 42;

type ImageOrientation = "landscape" | "portrait" | "square";

function heroTitleSizeClass(title: string): string {
  if (title.length <= 42) return "hero-title--short";
  if (title.length <= 78) return "hero-title--medium";
  return "hero-title--long";
}

export function PublicFeaturedHero({ items }: { items: PublicArticle[] }): JSX.Element {
  const [index, setIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [orientations, setOrientations] = useState<Record<string, ImageOrientation>>({});
  const [showScrollHint, setShowScrollHint] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    // "Rolar" some assim que o usuário começar a rolar a página — não
    // volta a aparecer depois (hint de primeira impressão, não um controle).
    function onScroll(): void {
      if (window.scrollY > 4) setShowScrollHint(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = (): void => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    const delay = isMobile ? MOBILE_AUTOPLAY_MS : DESKTOP_AUTOPLAY_MS;
    const timer = window.setTimeout(() => {
      setIndex((old) => (old === items.length - 1 ? 0 : old + 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [items.length, index, isMobile]);

  useEffect(() => {
    let cancelled = false;

    for (const item of items) {
      const url = item.cover?.url;
      if (!url || orientations[item.id]) continue;

      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
        // Retratos realmente próximos do formato vertical (ex.: 9:16)
        // respiram. Quadradas e horizontais percorrem lateralmente.
        const orientation: ImageOrientation = ratio > 1.08 ? "landscape" : ratio < 0.78 ? "portrait" : "square";
        setOrientations((current) => (current[item.id] ? current : { ...current, [item.id]: orientation }));
      };
      image.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [items, orientations]);

  if (items.length === 0) return <></>;

  const prev = (): void => setIndex((old) => (old === 0 ? items.length - 1 : old - 1));
  const next = (): void => setIndex((old) => (old === items.length - 1 ? 0 : old + 1));

  function handleMouseMove(event: MouseEvent<HTMLDivElement>): void {
    if (isMobile) return;
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--hero-px", `${(px * -8).toFixed(2)}px`);
    el.style.setProperty("--hero-py", `${(py * -6).toFixed(2)}px`);
  }

  function handleMouseLeave(): void {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--hero-px", "0px");
    el.style.setProperty("--hero-py", "0px");
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>): void {
    const touch = event.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>): void {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartXRef.current;
    const dy = touch.clientY - touchStartYRef.current;

    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    suppressClickRef.current = true;
    if (dx < 0) next();
    else prev();

    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);
  }

  return (
    <article className="hero-stage hero-backdrop relative w-full overflow-hidden">
      <div
        ref={stageRef}
        className="relative h-[100svh] min-h-[520px] w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {items.map((item, i) => {
          const isActive = i === index;
          const withPhoto = Boolean(item.cover?.url);
          const orientation = orientations[item.id];
          const fillsHero = orientation === "landscape";
          const mobileMotionClass = isMobile && isActive
            ? orientation === "portrait"
              ? "hero-mobile-breathe"
              : "hero-mobile-pan"
            : "";

          return (
            <Link
              href={`/noticias/${item.slug}`}
              key={item.id}
              className={`hero-slide group absolute inset-0 block ${isActive ? "opacity-100 z-10" : "pointer-events-none opacity-0 z-0"}`}
              aria-hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={(event) => {
                if (!suppressClickRef.current) return;
                event.preventDefault();
              }}
            >
              {withPhoto ? (
                <>
                  <div
                    className={`absolute -inset-10 scale-110 bg-cover bg-center blur-2xl transition-opacity duration-500 ${
                      fillsHero ? "opacity-28" : "opacity-70"
                    }`}
                    style={{ backgroundImage: `url(${item.cover?.url})` }}
                    aria-hidden="true"
                  />

                  <div className="hero-photo-layer absolute inset-0">
                    <div className="hero-parallax h-full w-full">
                      <div
                        className={`hero-photo-fg h-full w-full bg-center bg-no-repeat ${mobileMotionClass}`}
                        style={{
                          backgroundImage: `url(${item.cover?.url})`,
                          backgroundSize: isMobile
                            ? orientation === "portrait"
                              ? "contain"
                              : "auto 100%"
                            : fillsHero
                              ? "cover"
                              : "contain",
                        }}
                      />
                    </div>
                  </div>

                  <div className="hero-sheen absolute inset-0" />
                </>
              ) : null}

              <div className="hero-vertical-shade absolute inset-0" />

              <div className={`absolute inset-0 flex flex-col justify-end ${isActive ? "hero-text-reveal" : ""}`}>
                <div className="hero-copy site-shell w-full">
                  <span className="kicker" style={{ color: "#fff" }}>
                    <span style={{ background: "#fff" }} className="h-[2px] w-4" />
                    {item.sectionName}
                  </span>
                  <h1
                    className={`hero-title-contrast hero-title mt-3 max-w-4xl text-balance font-editorial font-bold text-white ${heroTitleSizeClass(item.title)}`}
                  >
                    {item.title}
                  </h1>
                  {item.subtitle ? (
                    <p className="hero-subtitle mt-3 max-w-2xl text-sm text-white/85 sm:mt-4 sm:text-base md:text-lg">{item.subtitle}</p>
                  ) : null}
                  <p className="hero-meta mt-3 text-[12px] font-semibold uppercase tracking-wide text-white/60 sm:mt-4">
                    {formatDateBR(item.publishedAt)} {item.localityName ? `· ${item.localityName}` : ""}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}

        <div className="site-shell pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start pt-[max(18px,env(safe-area-inset-top))]">
          <Link href="/" aria-label="Informativo Regional" className="pointer-events-auto inline-flex">
            <img
              src="/brand/logo-escrita.png"
              alt="Informativo Regional"
              className="h-auto w-[190px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:w-[220px] md:w-[250px]"
            />
          </Link>
        </div>
      </div>

      <div
        className={`hero-scroll-hint pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center md:hidden ${showScrollHint ? "" : "is-hidden"}`}
        style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}
        aria-hidden="true"
      >
        <span className="hero-scroll-label">
          Rolar <span className="hero-scroll-arrow">↓</span>
        </span>
      </div>

      {items.length > 1 ? (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-6 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-black/25 px-3 py-3 text-white transition hover:bg-black/50 md:block"
            aria-label="Destaque anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-6 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-black/25 px-3 py-3 text-white transition hover:bg-black/50 md:block"
            aria-label="Próximo destaque"
          >
            ›
          </button>

          <div className="hero-swipe-hint pointer-events-none absolute inset-x-0 top-[48%] z-30 flex items-center justify-between px-5 md:hidden" aria-hidden="true">
            <span className="hero-swipe-edge">‹</span>
            <span className="hero-swipe-label">deslize</span>
            <span className="hero-swipe-edge">›</span>
          </div>

          <div className="site-shell absolute inset-x-0 top-6 z-30 flex justify-end gap-1.5">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`hero-dot ${i === index ? "is-active" : ""}`}
                aria-label={`Ir para destaque ${i + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </article>
  );
}
