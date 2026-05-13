import { Fragment } from "react";
import type { NewsItem } from "@ir/types";
import type { SponsoredSlot } from "./content";
import { EditorialCard } from "./EditorialCard";
import { SponsoredNativeCard } from "./SponsoredNativeCard";

interface NewsFeedWithAdsProps {
  items: NewsItem[];
  ads: SponsoredSlot[];
  interval?: number;
  featuredFirst?: boolean;
}

export function NewsFeedWithAds({ items, ads, interval = 3, featuredFirst = false }: NewsFeedWithAdsProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item, index) => {
        const showAd = index > 0 && index % interval === 0 && ads.length > 0;
        const ad = showAd ? ads[(index / interval - 1) % ads.length] : null;

        return (
          <Fragment key={item.id}>
            <EditorialCard item={item} featured={featuredFirst && index === 0} />
            {ad ? <SponsoredNativeCard item={ad} /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}
