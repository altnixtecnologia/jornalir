"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdCreative, AdSlotConfig } from "./siteSettings";
import { ADS_SLOT_EFFECTS_STORAGE_KEY, ADS_SLOT_TIMERS_STORAGE_KEY, paidAdSlots } from "./siteSettings";

interface SlotState extends AdSlotConfig {
  creatives: AdCreative[];
}

function classBySize(sizeType: SlotState["sizeType"]): string {
  return sizeType === "grande" ? "aspect-[4/5]" : "aspect-[16/9]";
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function folderNameBySlotId(slotId: string): string {
  const m = slotId.match(/^(big|small)-(\d+)$/);
  if (!m) return slotId.replace("-", "");
  const [, prefix, num] = m;
  return prefix === "big" ? `grande${num}` : `pequena${num}`;
}

export function AdsSlotsManager(): JSX.Element {
  const [slots, setSlots] = useState<SlotState[]>(() => paidAdSlots.map((slot) => ({ ...slot, creatives: [...slot.creatives] })));
  const [dragState, setDragState] = useState<{ slotId: string; creativeIdx: number } | null>(null);

  const bigSlots = useMemo(() => slots.filter((slot) => slot.sizeType === "grande"), [slots]);
  const smallSlots = useMemo(() => slots.filter((slot) => slot.sizeType === "medio"), [slots]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADS_SLOT_TIMERS_STORAGE_KEY);
      const timers = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const rawEffects = localStorage.getItem(ADS_SLOT_EFFECTS_STORAGE_KEY);
      const effects = rawEffects ? (JSON.parse(rawEffects) as Record<string, SlotState["transitionEffect"]>) : {};
      setSlots((prev) =>
        prev.map((slot) => ({
          ...slot,
          rotateMs: typeof timers[slot.id] === "number" ? timers[slot.id] : slot.rotateMs,
          transitionEffect: effects[slot.id] ?? slot.transitionEffect
        }))
      );
    } catch {
      // ignore parse issues
    }
  }, []);

  function updateSlot(slotId: string, updater: (slot: SlotState) => SlotState): void {
    setSlots((prev) => {
      const next = prev.map((slot) => (slot.id === slotId ? updater(slot) : slot));
      try {
        const timers = Object.fromEntries(next.map((slot) => [slot.id, slot.rotateMs]));
        localStorage.setItem(ADS_SLOT_TIMERS_STORAGE_KEY, JSON.stringify(timers));
        const effects = Object.fromEntries(next.map((slot) => [slot.id, slot.transitionEffect ?? "fade"]));
        localStorage.setItem(ADS_SLOT_EFFECTS_STORAGE_KEY, JSON.stringify(effects));
      } catch {
        // ignore storage issues
      }
      return next;
    });
  }

  function removeCreative(slotId: string, idx: number): void {
    updateSlot(slotId, (slot) => ({ ...slot, creatives: slot.creatives.filter((_, i) => i !== idx) }));
  }

  function moveCreative(slotId: string, from: number, to: number): void {
    updateSlot(slotId, (slot) => {
      if (to < 0 || to >= slot.creatives.length) return slot;
      return { ...slot, creatives: moveItem(slot.creatives, from, to) };
    });
  }

  function onDrop(slotId: string, dropIdx: number): void {
    if (!dragState || dragState.slotId !== slotId) return;
    moveCreative(slotId, dragState.creativeIdx, dropIdx);
    setDragState(null);
  }

  function renderSlot(slot: SlotState): JSX.Element {
    return (
      <article key={slot.id} className="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{slot.label}</h3>
            <p className="text-xs text-zinc-500">Formato: {slot.sizeType === "grande" ? "Grande (4:5)" : "Pequeno (16:9)"}</p>
          </div>
          <span className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            Pasta: /public/uploads/anuncios/{folderNameBySlotId(slot.id)}
          </span>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold">Tempo do quadro (segundos)</label>
          <input
            type="number"
            min={2}
            max={120}
            value={Math.round(slot.rotateMs / 1000)}
            onChange={(e) => {
              const seconds = Number(e.target.value);
              if (Number.isNaN(seconds)) return;
              updateSlot(slot.id, (old) => ({ ...old, rotateMs: Math.max(2, seconds) * 1000 }));
            }}
            className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold">Efeito de troca</label>
          <select
            value={slot.transitionEffect ?? "fade"}
            onChange={(e) => {
              const effect = e.target.value as NonNullable<SlotState["transitionEffect"]>;
              updateSlot(slot.id, (old) => ({ ...old, transitionEffect: effect }));
            }}
            className="w-52 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="fade">Fade suave</option>
            <option value="slide">Deslizar</option>
            <option value="zoom">Zoom</option>
            <option value="flip">Flip</option>
            <option value="blur">Blur</option>
          </select>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {slot.creatives.map((creative, idx) => (
            <div
              key={`${slot.id}-${idx}`}
              draggable
              onDragStart={() => setDragState({ slotId: slot.id, creativeIdx: idx })}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(slot.id, idx)}
              className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <div className={`relative w-full overflow-hidden rounded ${classBySize(slot.sizeType)} bg-zinc-100 dark:bg-zinc-800`}>
                <img src={creative.imageUrl} alt={`${slot.label} imagem ${idx + 1}`} className="h-full w-full object-contain" />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button type="button" onClick={() => moveCreative(slot.id, idx, idx - 1)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">↑</button>
                  <button type="button" onClick={() => moveCreative(slot.id, idx, idx + 1)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">↓</button>
                </div>
                <button type="button" onClick={() => removeCreative(slot.id, idx)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 dark:border-rose-800 dark:text-rose-300">
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>

        {slot.creatives.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Nenhuma imagem neste quadro ainda.
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-editorial text-3xl">Quadros Grandes</h2>
        <div className="grid gap-4 lg:grid-cols-2">{bigSlots.map(renderSlot)}</div>
      </section>

      <section>
        <h2 className="mb-3 font-editorial text-3xl">Quadros Pequenos</h2>
        <div className="grid gap-4 lg:grid-cols-2">{smallSlots.map(renderSlot)}</div>
      </section>
    </div>
  );
}
