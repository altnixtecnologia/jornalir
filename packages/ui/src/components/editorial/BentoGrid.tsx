import type { NewsItem } from "@ir/types";
import { BentoCard } from "./BentoCard";

interface BentoGridProps {
  items: NewsItem[];
}

export function BentoGrid({ items }: BentoGridProps): JSX.Element {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {items.map((item, index) => (
        <BentoCard
          key={item.id}
          title={item.title}
          excerpt={item.excerpt}
          meta={`${item.author} - ${new Date(item.publishedAt).toLocaleDateString("pt-BR")}`}
          className={index === 0 ? "md:col-span-2 md:row-span-2" : ""}
        />
      ))}
    </section>
  );
}
