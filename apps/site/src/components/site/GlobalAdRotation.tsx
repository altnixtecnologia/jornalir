"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdCreative, AdSlot } from "./adSlots";
import { CONVEYOR_PATH, conveyorSnapshot } from "./sponsorConveyor";

const RotationContext = createContext<Map<string, AdSlot> | null>(null);

function sameSnapshot(a: Array<number | null>, b: Array<number | null>): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Esteira única de patrocinadores — regras em `sponsorConveyor.ts`. Envolve
 * a página (início e notícia); cada `AdSlotUnit` pergunta qual imagem a sua
 * posição física mostra agora.
 */
export function GlobalAdRotation({
  positions,
  pool,
  children,
}: {
  positions: AdSlot[];
  pool: AdCreative[];
  children: ReactNode;
}): JSX.Element {
  // Servidor e hidratação: posições vazias (o horário do servidor não é o
  // do leitor) — o relógio real preenche logo na montagem, sem baixar um
  // conjunto de imagens que seria trocado em seguida.
  const [snapshot, setSnapshot] = useState<Array<number | null>>(() => CONVEYOR_PATH.map(() => null));

  useEffect(() => {
    const update = () =>
      setSnapshot((previous) => {
        const next = conveyorSnapshot(Date.now(), pool.length);
        return sameSnapshot(previous, next) ? previous : next;
      });
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [pool.length]);

  const byPhysicalPosition = useMemo(() => {
    const result = new Map<string, AdSlot>();
    for (const position of positions) {
      const step = CONVEYOR_PATH.indexOf(position.id as (typeof CONVEYOR_PATH)[number]);
      const index = step >= 0 ? snapshot[step] : null;
      const creative = index !== null && index !== undefined ? pool[index] : undefined;
      result.set(position.id, { ...position, creatives: creative ? [creative] : [] });
    }
    return result;
  }, [positions, pool, snapshot]);

  return <RotationContext.Provider value={byPhysicalPosition}>{children}</RotationContext.Provider>;
}

/** Fora da esteira não mostra nada (nunca a fila inteira de uma vez, que repetiria imagens). */
export function useRotatingAdAtPosition(position: AdSlot): AdSlot {
  return useContext(RotationContext)?.get(position.id) ?? { ...position, creatives: [] };
}
