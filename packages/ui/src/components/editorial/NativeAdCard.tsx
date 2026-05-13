interface NativeAdCardProps {
  title: string;
  brand: string;
  description: string;
}

export function NativeAdCard({ title, brand, description }: NativeAdCardProps): JSX.Element {
  return (
    <aside className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Patrocinado</p>
      <h4 className="mt-2 text-base font-semibold">{title}</h4>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{description}</p>
      <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">{brand}</p>
    </aside>
  );
}
