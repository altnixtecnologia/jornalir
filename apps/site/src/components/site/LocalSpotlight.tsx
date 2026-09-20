import Link from "next/link";
import { formatDateBR } from "./date";
import type { SiteArticle } from "./siteArticleTypes";

/**
 * Bloco "Pela região": faixa de largura cheia (fundo diferente do resto da
 * página) reunindo matérias com localidade marcada — muda o ritmo visual da
 * rolagem em vez de repetir mais uma seção branca igual às anteriores.
 */
export function LocalSpotlight({ items }: { items: SiteArticle[] }): JSX.Element {
  const local = items.filter((item) => item.locality).slice(0, 4);
  if (local.length === 0) return <></>;

  return (
    <section className="local-band local-band--contained">
      <div className="py-10">
        <div className="section-head" style={{ borderBottomColor: "rgba(255,255,255,0.25)" }}>
          <h2 style={{ color: "#fff" }}>Nossa região</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {local.map((item) => (
            <Link key={item.id} href={`/noticias/${item.slug}`} className="group flex items-start justify-between gap-4 border-b border-white/15 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">{item.locality}</p>
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
