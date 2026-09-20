"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdSlot } from "./adSlots";

/**
 * Um quadro independente: gira só entre as próprias artes, com defasagem
 * inicial própria (`phaseOffsetMs`) para nunca trocar em sincronia com os
 * outros 5 quadros. O SLOT tem tamanho externo fixo (igual nos 6); a arte
 * usa object-fit:contain dentro dele — proporção da arte nunca altera o
 * tamanho do quadro (nunca corta, nunca deforma).
 */
export function AdSlotUnit({ slot, variant = "column" }: { slot: AdSlot; variant?: "column" | "pair" }): JSX.Element | null {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slot.creatives.length <= 1) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % slot.creatives.length);
      intervalId = setInterval(() => setIndex((prev) => (prev + 1) % slot.creatives.length), slot.rotateMs);
    }, Math.max(0, slot.phaseOffsetMs));

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [slot]);

  const current = useMemo(() => slot.creatives[index] ?? slot.creatives[0], [index, slot.creatives]);
  if (!current) return null;

  const content = (
    <img
      key={current.id}
      src={current.imageUrl}
      alt={current.alt ?? slot.label}
      loading="lazy"
      className="ad-slot-img ad-effect-fade"
    />
  );

  const unitClassName = variant === "pair" ? "ad-slot-unit ad-slot-unit--compact" : "ad-slot-unit";

  return <div className={unitClassName}>{current.href ? <a href={current.href} target="_blank" rel="noreferrer">{content}</a> : content}</div>;
}
