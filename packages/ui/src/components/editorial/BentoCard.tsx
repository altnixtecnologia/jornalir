import type { ReactNode } from "react";

interface BentoCardProps {
  title: string;
  excerpt: string;
  meta: string;
  className?: string;
  media?: ReactNode;
}

export function BentoCard({ title, excerpt, meta, media, className = "" }: BentoCardProps): JSX.Element {
  return (
    <article className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {media}
      <h3 className="mt-2 text-lg font-semibold leading-tight">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{excerpt}</p>
      <p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">{meta}</p>
    </article>
  );
}
