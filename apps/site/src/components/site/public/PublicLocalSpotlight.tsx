import Link from "next/link";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

/**
 * `LocalSpotlight` (Fase 29: "Nossa região" → "Mais destaques") adaptado a
 * `PublicArticle` real. Posição `localSpotlight` — já vem filtrada/limitada
 * pelo provider público (`listPublicPlacement`), não precisa filtrar de
 * novo por localidade aqui. `slice(0, 4)` é só uma salvaguarda de
 * apresentação (revisão visual): o bloco sempre mostra no máximo 4
 * matérias, nunca 6 — grid 2×2, nunca 3×2, para não deixar um card sobrando
 * numa terceira coluna.
 */
export function PublicLocalSpotlight({ items }: { items: PublicArticle[] }): JSX.Element {
  const highlighted = items.slice(0, 4);
  if (highlighted.length === 0) return <></>;

  return (
    <section className="local-band local-band--contained">
      <div className="py-10 sm:py-12">
        <div className="section-head" style={{ borderBottomColor: "rgba(255,255,255,0.25)" }}>
          <h2 style={{ color: "#fff" }}>Mais destaques</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2 sm:gap-y-1">
          {highlighted.map((item) => (
            <Link
              key={item.id}
              href={`/noticias/${item.slug}`}
              className="group flex items-start justify-between gap-4 border-b border-white/15 py-5 sm:py-6"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">{item.localityName}</p>
                <h4 className="mt-2 break-normal text-lg font-semibold leading-snug text-white transition group-hover:text-white/70 sm:text-xl">
                  {item.title}
                </h4>
                <p className="mt-2 text-[11px] uppercase tracking-wide text-white/40">{formatDateBR(item.publishedAt)}</p>
              </div>
              <span className="mt-1 flex-shrink-0 text-white/40 transition group-hover:translate-x-1 group-hover:text-white" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
