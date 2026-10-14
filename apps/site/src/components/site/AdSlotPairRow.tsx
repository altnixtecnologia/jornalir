import type { AdSlot } from "./adSlots";
import { AdSlotUnit } from "./AdSlotUnit";

export function AdSlotPairRow({ slots }: { slots: [AdSlot, AdSlot] }): JSX.Element | null {
  if (slots.every((slot) => slot.creatives.length === 0)) return null;
  return (
    <div className="ad-pair-row" aria-label="Publicidade">
      <p className="adsense-slot-label mb-2 text-center">Publicidade</p>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot) => <AdSlotUnit key={slot.id} slot={slot} variant="pair" />)}
      </div>
    </div>
  );
}
