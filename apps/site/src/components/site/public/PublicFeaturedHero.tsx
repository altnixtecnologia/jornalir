"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

const AUTOPLAY_MS = 8000;

/**
 * Faixas discretas por comprimento da manchete (revisão do hero): em vez
 * de um único tamanho de fonte para qualquer texto (que faz uma manchete
 * curta parecer gigante e uma longa quebrar em muitas linhas) ou
 * line-clamp (que corta o título — proibido aqui), cada faixa já nasce
 * num tamanho que cabe em menos linhas, sem nunca truncar o texto.
 */
function heroTitleSizeClass(title: string): string {
  if (title.length <= 42) return "hero-title--short";
  if (title.length <= 78) return "hero-title--medium";
  return "hero-title--long";
}

/**
 * `FeaturedHero` (Fase 14/29) adaptado a `PublicArticle` real (Fase 30) —
 * mesmo tratamento visual (moldura dissolvida, Ken Burns, parallax), só a
 * fonte de dados muda. Capa `mainCover`.
 */
export function PublicFeaturedHero({ items }: { items: PublicArticle[] }): JSX.Element {
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

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
        className="relative h-[70svh] max-h-[640px] min-h-[460px] w-full sm:h-[66svh] md:h-[600px] md:min-h-[520px] xl:h-[min(78svh,720px)] xl:min-h-[560px] xl:max-h-[720px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {items.map((item, i) => {
          const isActive = i === index;
          const withPhoto = Boolean(item.cover?.url);
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
                  <div className="hero-photo-layer absolute inset-0">
                    <div className="hero-parallax h-full w-full">
                      <div
                        className="hero-photo-fg hero-kenburns h-full w-full bg-center bg-no-repeat"
                        style={{
                          backgroundImage: `url(${item.cover?.url})`,
                          // Hero é cenográfico/full bleed (Ajuste pós-Fase 49): cover é
                          // permitido aqui — a regra "nunca cortar" vale para a imagem da
                          // matéria, galeria e cards, não para este fundo de destaque.
                          backgroundSize: "cover",
                        }}
                      />
                    </div>
                  </div>
                  <div className="hero-sheen absolute inset-0" />
                </>
              ) : null}

              <div className="hero-vertical-shade absolute inset-0" />

              {/* Coluna flex ancorada no rodapé (em vez de bottom-0 com altura
                  livre pelo conteúdo): a data/localidade é sempre o último
                  item, na mesma faixa inferior reservada (`.hero-copy`
                  padding-bottom) — o tamanho do título/subtítulo não desloca
                  mais essa faixa nem a empurra para fora da área visível. */}
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
