import Link from "next/link";
import type { CategorySlug } from "@ir/types";
import { formatDateBR } from "./date";
import { hasPhoto, type SiteArticle } from "./siteArticleTypes";
import { getCategoryLabel } from "./categories";

type Variant = "split" | "strip" | "list";

/**
 * Bloco de editoria reutilizável na home, com três variantes visuais — para
 * gerar ritmo (não repetir o mesmo desenho em toda seção), sem duplicar
 * lógica de busca/city/data entre seções.
 */
export function EditorialSection({
  category,
  items,
  href,
  variant = "split"
}: {
  category: CategorySlug;
  items: SiteArticle[];
  href: string;
  variant?: Variant;
}): JSX.Element {
  if (items.length === 0) return <></>;

  return (
    <section className="py-10">
      <div className="section-head">
        <h2>{getCategoryLabel(category)}</h2>
        <Link href={href} className="section-more">
          Ver mais <span aria-hidden="true">→</span>
        </Link>
      </div>
      {variant === "split" ? <SplitLayout items={items} /> : null}
      {variant === "strip" ? <StripLayout items={items} /> : null}
      {variant === "list" ? <ListLayout items={items} /> : null}
    </section>
  );
}

function CoverImage({ item, className }: { item: SiteArticle; className: string }): JSX.Element {
  return (
    <div className={`relative overflow-hidden rounded-sm ${className}`}>
      {hasPhoto(item) ? (
        <div className="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.04]" style={{ backgroundImage: `url(${item.imageUrl})` }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[color:var(--brand-navy)]">
          <span className="font-editorial text-xl font-bold text-white/25">IR</span>
        </div>
      )}
    </div>
  );
}

/** Manchete da editoria à esquerda, duas secundárias empilhadas à direita. */
function SplitLayout({ items }: { items: SiteArticle[] }): JSX.Element {
  const [lead, ...rest] = items;
  const secondary = rest.slice(0, 2);

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
      <Link href={`/noticias/${lead.slug}`} className="group block">
        <CoverImage item={lead} className="h-64 md:h-80" />
        <h3 className="mt-4 font-editorial text-2xl font-bold leading-tight text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)] md:text-3xl">
          {lead.title}
        </h3>
        <p className="mt-2 text-sm text-[color:var(--site-muted)]">{lead.excerpt}</p>
      </Link>
      <div className="flex flex-col gap-5">
        {secondary.map((item) => (
          <Link key={item.id} href={`/noticias/${item.slug}`} className="group grid grid-cols-[120px_1fr] gap-3">
            <CoverImage item={item} className="h-24" />
            <div>
              <h4 className="text-base font-semibold leading-snug text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)]">
                {item.title}
              </h4>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-[color:var(--site-muted)]">{formatDateBR(item.publishedAt)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Faixa horizontal de itens compactos, rolável no mobile. */
function StripLayout({ items }: { items: SiteArticle[] }): JSX.Element {
  return (
    <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {items.slice(0, 4).map((item) => (
        <Link key={item.id} href={`/noticias/${item.slug}`} className="group block w-[70%] flex-shrink-0 md:w-auto">
          <CoverImage item={item} className="h-36" />
          <p className="kicker mt-3">{formatDateBR(item.publishedAt)}</p>
          <h4 className="mt-1 text-base font-semibold leading-snug text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)]">
            {item.title}
          </h4>
        </Link>
      ))}
    </div>
  );
}

/** Lista só de texto, sem foto grande — pensada para colunistas/opinião. */
function ListLayout({ items }: { items: SiteArticle[] }): JSX.Element {
  return (
    <ol className="divide-y divide-[color:var(--site-line)]">
      {items.slice(0, 5).map((item) => (
        <li key={item.id}>
          <Link href={`/noticias/${item.slug}`} className="group flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <h4 className="truncate text-lg font-semibold text-[color:var(--site-text)] group-hover:text-[color:var(--brand-red)]">
                {item.title}
              </h4>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-[color:var(--site-muted)]">
                {item.author} · {formatDateBR(item.publishedAt)}
              </p>
            </div>
            <span className="flex-shrink-0 text-[color:var(--site-line)] transition group-hover:translate-x-1 group-hover:text-[color:var(--brand-red)]" aria-hidden="true">
              →
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
