"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

const DESKTOP_AUTOPLAY_MS = 8_000;
const MOBILE_AUTOPLAY_MS = 16_000;

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
  const stageRef = useRef<HTMLDivElement>(null);

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
        const orientation: ImageOrientation = ratio > 1.08 ? "landscape" : ratio < 0.72 ? "portrait" : "square";
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

  return (
    <article className="hero-stage hero-backdrop relative w-full overflow-hidden">
      <div
        ref={stageRef}
        className="relative h-[100svh] min-h-[520px] w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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

      {items.length > 1 ? (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/25 px-3 py-3 text-white transition hover:bg-black/50 md:left-6"
            aria-label="Destaque anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/25 px-3 py-3 text-white transition hover:bg-black/50 md:right-6"
            aria-label="Próximo destaque"
          >
            ›
          </button>
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
