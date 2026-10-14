import type { AdSlot } from "./adSlots";
import { AdSlotUnit } from "./AdSlotUnit";

export function AdSlotColumn({ slots, side }: { slots: AdSlot[]; side: "left" | "right" }): JSX.Element {
  return (
    <aside className="ad-slot-column" aria-label={"Publicidade — coluna " + (side === "left" ? "esquerda" : "direita")}>
      <div className="ad-slot-column-sticky">
        <p className="adsense-slot-label mb-3 text-center">Publicidade</p>
        <div className="flex flex-col gap-4">
          {slots.map((slot) => <AdSlotUnit key={slot.id} slot={slot} />)}
        </div>
      </div>
    </aside>
  );
}
