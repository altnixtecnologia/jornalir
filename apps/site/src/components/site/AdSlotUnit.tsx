"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdSlot } from "./adSlots";

export function AdSlotUnit({
  slot,
  variant = "column",
}: {
  slot: AdSlot;
  variant?: "column" | "pair";
}): JSX.Element | null {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (slot.creatives.length <= 1) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % slot.creatives.length);
      intervalId = setInterval(
        () => setIndex((prev) => (prev + 1) % slot.creatives.length),
        Math.max(2000, slot.rotateMs),
      );
    }, Math.max(0, slot.phaseOffsetMs));

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [slot.creatives.length, slot.phaseOffsetMs, slot.rotateMs]);

  const current = useMemo(() => slot.creatives[index] ?? slot.creatives[0], [index, slot.creatives]);
  if (!current) return null;

  const fitClass = slot.fitMode === "stretch" ? " ad-slot-img--stretch" : "";
  const content = (
    <img
      key={current.id}
      src={current.imageUrl}
      alt={current.alt ?? slot.label}
      loading="lazy"
      className={"ad-slot-img" + fitClass + " ad-effect-" + slot.transitionEffect}
    />
  );

  const unitClassName = variant === "pair" ? "ad-slot-unit ad-slot-unit--compact" : "ad-slot-unit";
  return <div className={unitClassName}>{current.href ? <a href={current.href} target="_blank" rel="noreferrer">{content}</a> : content}</div>;
}
