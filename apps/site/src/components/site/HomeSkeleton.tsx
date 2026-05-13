export function HomeSkeleton(): JSX.Element {
  return (
    <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-6">
      <div className="h-5 animate-pulse rounded-full bg-zinc-300/70 md:col-span-3 dark:bg-zinc-700" />
      <div className="h-5 animate-pulse rounded-full bg-zinc-300/70 md:col-span-2 dark:bg-zinc-700" />
      <div className="h-5 animate-pulse rounded-full bg-zinc-300/70 md:col-span-1 dark:bg-zinc-700" />
    </section>
  );
}
