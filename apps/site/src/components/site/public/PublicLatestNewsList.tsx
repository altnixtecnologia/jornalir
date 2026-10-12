"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

const DESKTOP_AUTO_ROTATION_MS = 20_000;
const MOBILE_AUTO_ROTATION_MS = 12_000;
const MANUAL_HOLD_MS = 30_000;

type RotationState = {
  index: number;
  nextDelayMs: number;
};

export function PublicLatestNewsList({ items }: { items: PublicArticle[] }): JSX.Element {
  const [rotation, setRotation] = useState<RotationState>({ index: 0, nextDelayMs: DESKTOP_AUTO_ROTATION_MS });
  const [isMobile, setIsMobile] = useState(false);
  const activeStoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = (): void => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;

    const effectiveDelay =
      rotation.nextDelayMs === DESKTOP_AUTO_ROTATION_MS && isMobile
        ? MOBILE_AUTO_ROTATION_MS
        : rotation.nextDelayMs;

    const timer = window.setTimeout(() => {
      setRotation((previous) => {
        const currentIndex = previous.index < items.length ? previous.index : 0;
        return {
          index: (currentIndex + 1) % items.length,
          nextDelayMs: isMobile ? MOBILE_AUTO_ROTATION_MS : DESKTOP_AUTO_ROTATION_MS,
        };
      });
    }, effectiveDelay);

    return () => window.clearTimeout(timer);
  }, [items.length, rotation.index, rotation.nextDelayMs, isMobile]);

  if (items.length === 0) return <></>;

  const selectedIndex = rotation.index < items.length ? rotation.index : 0;
  const selected = items[selectedIndex];

  function selectManually(index: number): void {
    setRotation({ index, nextDelayMs: MANUAL_HOLD_MS });

    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.setTimeout(() => {
        const target = activeStoryRef.current;
        if (!target) return;
        const top = target.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }, 40);
    }
  }

  return (
    <section className="pb-10">
      <div className="section-head">
        <h2>Últimas notícias</h2>
        <Link href="/noticias" className="section-more">
          Ver todas <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div ref={activeStoryRef} key={selected.id} className="reveal-up">
          <div className="relative h-64 overflow-hidden rounded-sm bg-[color:var(--site-bg)] md:h-80">
            {selected.cover?.url ? (
              <div className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${selected.cover.url})` }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
                <span className="font-editorial text-3xl font-bold text-white/25">IR</span>
              </div>
            )}
          </div>
          <div className="latest-news-active mt-4">
            <p className="kicker">{selected.sectionName}</p>
            <h3 className="mt-2 font-editorial text-[26px] font-bold leading-tight text-[color:var(--site-text)] md:text-[30px]">
              {selected.title}
            </h3>
            {selected.subtitle ? (
              <p className="mt-2 text-[15px] leading-snug text-[color:var(--site-muted)]">{selected.subtitle}</p>
            ) : null}
            <Link
              href={`/noticias/${selected.slug}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[color:var(--brand-red)] hover:gap-2.5"
            >
              Ler matéria <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <ol className="divide-y divide-[color:var(--site-line)] lg:border-l lg:border-[color:var(--site-line)] lg:pl-8">
          {items.map((item, i) => {
            const isActive = i === selectedIndex;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => selectManually(i)}
                  aria-pressed={isActive}
                  className={`group flex w-full items-start gap-4 border-l-2 py-4 pl-3 text-left transition-colors ${
                    isActive ? "border-[color:var(--brand-red)]" : "border-transparent"
                  }`}
                >
                  <span
                    className={`font-editorial text-xl font-bold leading-none transition-colors ${
                      isActive
                        ? "text-[color:var(--brand-red)]"
                        : "text-[color:var(--site-line)] group-hover:text-[color:var(--brand-red)]"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--site-muted)]">
                      {item.sectionName} · {formatDateBR(item.publishedAt)}
                    </p>
                    <h4
                      className={`mt-1 text-base font-semibold leading-snug transition-colors ${
                        isActive
                          ? "text-[color:var(--brand-red)]"
                          : "text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)]"
                      }`}
                    >
                      {item.title}
                    </h4>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
