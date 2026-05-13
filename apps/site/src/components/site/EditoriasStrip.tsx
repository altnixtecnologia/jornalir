import Link from "next/link";
import type { CategorySlug, NewsItem } from "@ir/types";

const categoryStyle: Partial<Record<CategorySlug, string>> = {
  geral: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300",
  noticias: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  esportes: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
};

const categoryLabel: Partial<Record<CategorySlug, string>> = {
  geral: "Geral",
  noticias: "Notícias",
  esportes: "Esportes"
};

export function EditoriasStrip({ items }: { items: NewsItem[] }): JSX.Element {
  const allowed: CategorySlug[] = ["geral", "noticias", "esportes"];
  const topByCategory = allowed
    .map((cat) => items.find((item) => item.category === cat))
    .filter((item): item is NewsItem => Boolean(item));

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {topByCategory.map((item) => (
        <Link key={`${item.category}-${item.id}`} href={item.category === "esportes" ? "/esportes" : "/noticias"} className={`rounded-2xl border p-4 ${categoryStyle[item.category] ?? "border-zinc-300 bg-white text-zinc-800"}`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em]">{categoryLabel[item.category] ?? "Categoria"}</p>
          <h3 className="mt-2 font-editorial text-xl leading-tight">{item.title}</h3>
        </Link>
      ))}
    </section>
  );
}
