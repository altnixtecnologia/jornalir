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
  }, [slot.id, slot.creatives.length]);

  const current = useMemo(() => slot.creatives[index] ?? slot.creatives[0], [index, slot.creatives]);

  // Cada imagem controla sua própria duração (current.rotateMs) — nunca um intervalo fixo
  // compartilhado pela posição. O primeiro ciclo soma o deslocamento de fase (phaseOffsetMs)
  // pra evitar que todas as posições troquem de imagem exatamente no mesmo instante.
  useEffect(() => {
    if (slot.creatives.length <= 1 || !current) return;
    const phase = index === 0 ? Math.max(0, slot.phaseOffsetMs) : 0;
    const timeoutId = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % slot.creatives.length);
    }, Math.max(2000, current.rotateMs) + phase);
    return () => window.clearTimeout(timeoutId);
  }, [current, index, slot.creatives.length, slot.phaseOffsetMs]);

  if (!current) return null;

  const fitClass = current.fitMode === "stretch" ? " ad-slot-img--stretch" : "";
  const content = (
    <img
      key={current.id}
      src={current.imageUrl}
      alt={current.alt ?? slot.label}
      loading="lazy"
      className={"ad-slot-img" + fitClass + " ad-effect-" + current.transitionEffect}
    />
  );

  const unitClassName = variant === "pair" ? "ad-slot-unit ad-slot-unit--compact" : "ad-slot-unit";
  return <div className={unitClassName}>{current.href ? <a href={current.href} target="_blank" rel="sponsored noopener noreferrer">{content}</a> : content}</div>;
}
