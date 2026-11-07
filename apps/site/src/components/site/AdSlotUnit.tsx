"use client";

import { adFitClassName, type AdSlot } from "./adSlots";
import { useRotatingAdAtPosition } from "./GlobalAdRotation";

export function AdSlotUnit({
  slot,
  variant = "column",
}: {
  slot: AdSlot;
  variant?: "column" | "pair";
}): JSX.Element | null {
  // O grupo exibido muda de posição de forma coordenada; o tempo e o índice
  // da imagem são controlados globalmente para não reiniciar a cada mudança.
  const displayedSlot = useRotatingAdAtPosition(slot);
  const current = displayedSlot.creatives[0];
  if (!current) return null;

  // O formato (Esticar/Encaixar/Preencher) é da IMAGEM e a acompanha em
  // qualquer uma das seis posições da esteira.
  const content = (
    <img
      key={current.id}
      src={current.imageUrl}
      alt={current.alt ?? slot.label}
      loading="lazy"
      className={"ad-slot-img " + adFitClassName(current.fitMode) + " ad-effect-" + current.transitionEffect}
    />
  );

  const unitClassName = variant === "pair" ? "ad-slot-unit ad-slot-unit--compact" : "ad-slot-unit";
  return (
    <div className={unitClassName}>
      {current.href ? <a href={current.href} target="_blank" rel="sponsored noopener noreferrer">{content}</a> : content}
    </div>
  );
}
