"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ADS_SLOT_EFFECTS_STORAGE_KEY, ADS_SLOT_TIMERS_STORAGE_KEY, type AdSlotConfig } from "./siteSettings";

function SlotCard({ slot, mode }: { slot: AdSlotConfig; mode: "sidebar" | "strip" }): JSX.Element {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slot.creatives.length <= 1) return;
    const phase = Math.max(0, slot.phaseOffsetMs ?? 0);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      setIndex((prev) => (prev + 1) % slot.creatives.length);
      intervalId = setInterval(() => setIndex((prev) => (prev + 1) % slot.creatives.length), slot.rotateMs);
    }, phase);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [slot]);

  const current = useMemo(() => slot.creatives[index] ?? slot.creatives[0], [index, slot.creatives]);

  const box = mode === "sidebar"
    ? "aspect-[4/5]"
    : "aspect-[16/9]";

  const content = (
    <div className={`w-full ${box} bg-zinc-100 dark:bg-zinc-800`}>
      <img
        key={`${slot.id}-${index}`}
        src={current.imageUrl}
        alt={slot.label}
        className={`h-full w-full object-contain ad-effect-${slot.transitionEffect ?? "fade"}`}
      />
    </div>
  );

  return (
    <article className="overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      {current.href ? <Link href={current.href}>{content}</Link> : content}
    </article>
  );
}

export function PaidAdsColumn({ slots }: { slots: AdSlotConfig[] }): JSX.Element {
  const [effectiveSlots, setEffectiveSlots] = useState<AdSlotConfig[]>(slots);

  useEffect(() => {
    setEffectiveSlots(slots);
    try {
      const raw = localStorage.getItem(ADS_SLOT_TIMERS_STORAGE_KEY);
      if (!raw) return;
      const timers = JSON.parse(raw) as Record<string, number>;
      const effectsRaw = localStorage.getItem(ADS_SLOT_EFFECTS_STORAGE_KEY);
      const effects = effectsRaw ? (JSON.parse(effectsRaw) as Record<string, AdSlotConfig["transitionEffect"]>) : {};
      setEffectiveSlots(
        slots.map((slot) => ({
          ...slot,
          rotateMs: typeof timers[slot.id] === "number" ? timers[slot.id] : slot.rotateMs,
          transitionEffect: effects[slot.id] ?? slot.transitionEffect
        }))
      );
    } catch {
      // ignore storage issues
    }
  }, [slots]);

  return (
    <aside className="space-y-3">
      {effectiveSlots.map((slot) => (
        <SlotCard key={slot.id} slot={slot} mode="sidebar" />
      ))}
    </aside>
  );
}

export function PaidAdsStrip({ slots }: { slots: AdSlotConfig[] }): JSX.Element {
  const [effectiveSlots, setEffectiveSlots] = useState<AdSlotConfig[]>(slots);

  useEffect(() => {
    setEffectiveSlots(slots);
    try {
      const raw = localStorage.getItem(ADS_SLOT_TIMERS_STORAGE_KEY);
      if (!raw) return;
      const timers = JSON.parse(raw) as Record<string, number>;
      const effectsRaw = localStorage.getItem(ADS_SLOT_EFFECTS_STORAGE_KEY);
      const effects = effectsRaw ? (JSON.parse(effectsRaw) as Record<string, AdSlotConfig["transitionEffect"]>) : {};
      setEffectiveSlots(
        slots.map((slot) => ({
          ...slot,
          rotateMs: typeof timers[slot.id] === "number" ? timers[slot.id] : slot.rotateMs,
          transitionEffect: effects[slot.id] ?? slot.transitionEffect
        }))
      );
    } catch {
      // ignore storage issues
    }
  }, [slots]);

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {effectiveSlots.map((slot) => (
        <SlotCard key={slot.id} slot={slot} mode="strip" />
      ))}
    </section>
  );
}
