import type { SponsoredSlot } from "./content";

export function SponsoredNativeCard({ item }: { item: SponsoredSlot }): JSX.Element {
  return (
    <article className="border-y border-zinc-300/70 py-4 dark:border-zinc-700">
      <div className="grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
        <div className="h-40 overflow-hidden md:h-44">
          <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${item.imagem})` }} />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Patrocinado</p>
          <h3 className="mt-2 font-editorial text-2xl leading-tight">{item.titulo}</h3>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{item.descricao}</p>
          <p className="mt-2 text-xs uppercase tracking-wider text-zinc-500">{item.marca}</p>
        </div>
      </div>
    </article>
  );
}

export function MobilePinnedPromo({ item }: { item: SponsoredSlot }): JSX.Element {
  return (
    <aside className="border-y border-zinc-300/70 py-3 dark:border-zinc-700 md:hidden">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Patrocinado</p>
      <p className="mt-1 font-editorial text-xl leading-tight">{item.titulo}</p>
      <p className="mt-1 text-xs text-zinc-500">{item.marca}</p>
    </aside>
  );
}
