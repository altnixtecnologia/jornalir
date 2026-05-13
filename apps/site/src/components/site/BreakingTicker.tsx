import type { NewsItem } from "@ir/types";

interface BreakingTickerProps {
  items: NewsItem[];
}

export function BreakingTicker({ items }: BreakingTickerProps): JSX.Element {
  const loopItems = [...items, ...items];

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30">
      <div className="flex items-center gap-3 border-b border-rose-200 px-4 py-2 dark:border-rose-900">
        <span className="rounded-full bg-rose-600 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">Ultima Hora</span>
        <p className="text-xs text-rose-800 dark:text-rose-200">Atualizacoes em tempo real da regiao</p>
      </div>
      <div className="overflow-hidden px-3 py-3">
        <div className="ticker-track flex w-max gap-3">
          {loopItems.map((item, idx) => (
            <a key={`${item.id}-${idx}`} href={`/noticias/${item.slug}`} className="min-w-[250px] rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-zinc-800 transition hover:bg-rose-50 dark:border-rose-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-rose-950/20">
              {item.title}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
