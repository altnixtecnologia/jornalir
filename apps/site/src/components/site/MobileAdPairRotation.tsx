"use client";

import { useEffect, useState } from "react";
import type { SiteAdTransitionEffect } from "@ir/types";
import type { AdCreative } from "./adSlots";

function normalizedRotateMs(value: number): number {
  return Math.max(3000, value);
}

export function MobileAdPairRotation({
  creatives,
  pairIndex,
  rotateMs,
  effect = "fade",
}: {
  creatives: AdCreative[];
  pairIndex: 0 | 1 | 2;
  rotateMs: number;
  effect?: SiteAdTransitionEffect;
}): JSX.Element | null {
  const safeRotateMs = normalizedRotateMs(rotateMs);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (creatives.length <= 1) return;

    let intervalId: number | null = null;

    const syncCycle = (): void => {
      setCycle(Math.floor(Date.now() / safeRotateMs));
    };

    syncCycle();

    const remainder = Date.now() % safeRotateMs;
    const firstDelay = remainder === 0 ? safeRotateMs : safeRotateMs - remainder;
    const timeoutId = window.setTimeout(() => {
      syncCycle();
      intervalId = window.setInterval(syncCycle, safeRotateMs);
    }, firstDelay);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [creatives.length, safeRotateMs]);

  if (creatives.length === 0) return null;

  const baseOffset = pairIndex * 2;
  const shown = [0, 1].map((position) => creatives[(cycle + baseOffset + position) % creatives.length]);

  return (
    <div className="ad-pair-row" aria-label="Publicidade">
      <p className="adsense-slot-label mb-2 text-center">Publicidade</p>
      <div className="grid grid-cols-2 gap-3">
        {shown.map((creative, position) => {
          const content = (
            <img
              key={creative.id}
              src={creative.imageUrl}
              alt={creative.alt ?? `Patrocinador ${baseOffset + position + 1}`}
              loading="lazy"
              className={`ad-slot-img ad-effect-${effect}`}
            />
          );

          return (
            <div key={`${pairIndex}-${position}-${creative.id}`} className="ad-slot-unit ad-slot-unit--compact">
              {creative.href ? (
                <a href={creative.href} target="_blank" rel="noreferrer">
                  {content}
                </a>
              ) : (
                content
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
