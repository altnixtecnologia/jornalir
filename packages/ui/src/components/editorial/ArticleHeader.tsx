import type { NewsItem } from "@ir/types";

export function ArticleHeader({ item }: { item: NewsItem }): JSX.Element {
  return (
    <header className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{item.category}</p>
      <h1 className="text-3xl font-bold leading-tight">{item.title}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Por {item.author} - {new Date(item.publishedAt).toLocaleDateString("pt-BR")} - {item.readMinutes} min de leitura
      </p>
    </header>
  );
}
