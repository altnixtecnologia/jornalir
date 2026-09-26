"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

const AUTOPLAY_MS = 8000;

type Orientation = "landscape" | "portrait";

/** Mesma lógica de `FeaturedHero` (mock) — detecta a orientação real de cada foto antes de decidir `cover`/`contain`. */
function useOrientations(items: PublicArticle[]): Record<string, Orientation> {
  const [orientations, setOrientations] = useState<Record<string, Orientation>>({});

  useEffect(() => {
    let cancelled = false;
    for (const item of items) {
      if (!item.cover?.url || orientations[item.id]) continue;
      const probe = new window.Image();
      probe.onload = () => {
        if (cancelled) return;
        const isLandscape = probe.naturalWidth >= probe.naturalHeight * 1.1;
        setOrientations((prev) => ({ ...prev, [item.id]: isLandscape ? "landscape" : "portrait" }));
      };
      probe.src = item.cover.url;
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return orientations;
}

/**
 * `FeaturedHero` (Fase 14/29) adaptado a `PublicArticle` real (Fase 30) —
 * mesmo tratamento visual (moldura dissolvida, Ken Burns, parallax), só a
 * fonte de dados muda. Capa `mainCover`.
 */
export function PublicFeaturedHero({ items }: { items: PublicArticle[] }): JSX.Element {
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const orientations = useOrientations(items);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((old) => (old === items.length - 1 ? 0 : old + 1));
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return <></>;

  const prev = (): void => setIndex((old) => (old === 0 ? items.length - 1 : old - 1));
  const next = (): void => setIndex((old) => (old === items.length - 1 ? 0 : old + 1));

  function handleMouseMove(event: MouseEvent<HTMLDivElement>): void {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--hero-px", `${(px * -14).toFixed(2)}px`);
    el.style.setProperty("--hero-py", `${(py * -10).toFixed(2)}px`);
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
        className="relative h-[60vh] min-h-[420px] w-full sm:h-[64vh] md:h-[620px] xl:h-[92vh] xl:max-h-[780px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {items.map((item, i) => {
          const isActive = i === index;
          const withPhoto = Boolean(item.cover?.url);
          const orientation = orientations[item.id] ?? "landscape";
          return (
            <Link
              href={`/noticias/${item.slug}`}
              key={item.id}
              className={`group absolute inset-0 block transition-opacity duration-[1100ms] ease-in-out ${isActive ? "opacity-100 z-10" : "pointer-events-none opacity-0 z-0"}`}
              aria-hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
            >
              {withPhoto ? (
                <>
                  <div className="hero-photo-layer absolute inset-x-0 top-0 bottom-0 md:left-[6%] md:right-[-4%] md:top-[8%] md:bottom-0">
                    <div className="hero-parallax h-full w-full">
                      <div
                        className={`hero-photo-fg h-full w-full bg-center bg-no-repeat ${isActive ? "hero-kenburns" : ""}`}
                        style={{
                          backgroundImage: `url(${item.cover?.url})`,
                          backgroundSize: orientation === "portrait" ? "contain" : "cover",
                        }}
                      />
                    </div>
                  </div>
                  <div className="hero-sheen absolute inset-0" />
                </>
              ) : null}

              <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--brand-navy)] via-transparent to-transparent" />

              <div className={`absolute inset-x-0 bottom-0 pb-10 pt-24 md:pb-16 xl:pb-20 ${isActive ? "hero-text-reveal" : ""}`}>
                <div className="site-shell">
                  <span className="kicker" style={{ color: "#fff" }}>
                    <span style={{ background: "#fff" }} className="h-[2px] w-4" />
                    {item.sectionName}
                  </span>
                  <h1 className="mt-4 max-w-4xl font-editorial text-[38px] font-bold leading-[1.03] text-white drop-shadow-lg sm:text-[50px] md:text-[64px] xl:text-[78px]">
                    {item.title}
                  </h1>
                  {item.subtitle ? (
                    <p className="mt-5 max-w-2xl text-base leading-snug text-white/85 md:text-xl">{item.subtitle}</p>
                  ) : null}
                  <p className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-white/60">
                    {formatDateBR(item.publishedAt)} {item.localityName ? `· ${item.localityName}` : ""}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {items.length > 1 ? (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/25 px-3 py-3 text-white transition hover:bg-black/50 md:left-6"
            aria-label="Destaque anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/25 px-3 py-3 text-white transition hover:bg-black/50 md:right-6"
            aria-label="Próximo destaque"
          >
            ›
          </button>
          <div className="site-shell absolute inset-x-0 top-6 z-20 flex justify-end gap-1.5">
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
