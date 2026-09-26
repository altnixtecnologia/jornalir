import Link from "next/link";
import { formatDateBR } from "../date";
import type { PublicArticle } from "../../../lib/public/types";

/**
 * `LocalSpotlight` (Fase 29: "Nossa região" → "Mais destaques") adaptado a
 * `PublicArticle` real. Posição `localSpotlight` — já vem filtrada/limitada
 * pelo provider público (`listPublicPlacement`), não precisa filtrar de
 * novo por localidade aqui.
 */
export function PublicLocalSpotlight({ items }: { items: PublicArticle[] }): JSX.Element {
  if (items.length === 0) return <></>;

  return (
    <section className="local-band local-band--contained">
      <div className="py-10">
        <div className="section-head" style={{ borderBottomColor: "rgba(255,255,255,0.25)" }}>
          <h2 style={{ color: "#fff" }}>Mais destaques</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {items.map((item) => (
            <Link key={item.id} href={`/noticias/${item.slug}`} className="group flex items-start justify-between gap-4 border-b border-white/15 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">{item.localityName}</p>
                <h4 className="mt-1 break-normal text-lg font-semibold leading-snug text-white group-hover:text-white/70">{item.title}</h4>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-white/40">{formatDateBR(item.publishedAt)}</p>
              </div>
              <span className="mt-1 flex-shrink-0 text-white/40 transition group-hover:translate-x-1 group-hover:text-white" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
