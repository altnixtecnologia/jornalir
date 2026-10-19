"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdSlot } from "./adSlots";

// A cada rodada, todos os seis grupos mudam uma posição (inclusive de lado).
// Os anúncios de cada grupo continuam alternando no seu tempo individual.
const GROUP_POSITION_ROTATION_MS = 30_000;

interface PlaylistProgress {
  index: number;
  deadline: number;
}

const RotationContext = createContext<Map<string, AdSlot> | null>(null);

function creativeDuration(ms: number): number {
  return Number.isFinite(ms) ? Math.max(2000, Math.min(120000, ms)) : 10000;
}

/**
 * A mesma coleção não pode ocupar duas posições ao mesmo tempo.
 * Em seis rodadas cada grupo passa pelas seis posições, sem que o editor
 * precise cadastrar a arte em mais de um lugar. Os índices das playlists
 * pertencem aos GRUPOS e não às posições físicas, por isso mover um grupo
 * não reinicia a imagem e não ignora uma duração individual longa.
 */
export function GlobalAdRotation({
  slots,
  children,
}: {
  slots: AdSlot[];
  children: ReactNode;
}): JSX.Element {
  const [phase, setPhase] = useState(0);
  const [playlists, setPlaylists] = useState<Record<string, PlaylistProgress>>({});

  useEffect(() => {
    function advance(): void {
      const now = Date.now();
      setPhase(Math.floor(now / GROUP_POSITION_ROTATION_MS) % Math.max(1, slots.length));

      setPlaylists((previous) => {
        let next: Record<string, PlaylistProgress> | null = null;

        for (const group of slots) {
          const count = group.creatives.length;
          if (count === 0) continue;

          const stored = previous[group.id];
          if (!stored || stored.index >= count) {
            if (!next) next = { ...previous };
            next[group.id] = {
              index: 0,
              deadline: now + creativeDuration(group.creatives[0].rotateMs),
            };
            continue;
          }
          if (count === 1 || now < stored.deadline) continue;

          let index = stored.index;
          let deadline = stored.deadline;
          // A aba pode voltar depois de muito tempo suspensa no Android.
          // Avançar os períodos vencidos sem criar milhares de renderizações.
          const limit = count * 4;
          for (let step = 0; now >= deadline && step < limit; step += 1) {
            index = (index + 1) % count;
            deadline += creativeDuration(group.creatives[index].rotateMs);
          }
          if (now >= deadline) {
            deadline = now + creativeDuration(group.creatives[index].rotateMs);
          }

          if (!next) next = { ...previous };
          next[group.id] = { index, deadline };
        }

        return next ?? previous;
      });
    }

    advance();
    const timer = window.setInterval(advance, 1000);
    return () => window.clearInterval(timer);
  }, [slots]);

  const byPhysicalPosition = useMemo(() => {
    const result = new Map<string, AdSlot>();
    const count = slots.length;
    if (!count) return result;

    slots.forEach((position, positionIndex) => {
      const group = slots[(positionIndex + phase) % count];
      const activeIndex = playlists[group.id]?.index ?? 0;
      const creative = group.creatives[activeIndex] ?? group.creatives[0];

      result.set(position.id, {
        ...group,
        id: position.id,
        label: position.label,
        creatives: creative ? [creative] : [],
      });
    });

    return result;
  }, [phase, playlists, slots]);

  return <RotationContext.Provider value={byPhysicalPosition}>{children}</RotationContext.Provider>;
}

export function useRotatingAdAtPosition(position: AdSlot): AdSlot {
  return useContext(RotationContext)?.get(position.id) ?? position;
}
