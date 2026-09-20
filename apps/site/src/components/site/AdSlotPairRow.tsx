import type { AdSlot } from "./adSlots";
import { AdSlotUnit } from "./AdSlotUnit";

/**
 * Mobile: dois quadros lado a lado, dentro do fluxo editorial (nunca os 6
 * juntos). Cada par usa dois dos seis quadros independentes.
 */
export function AdSlotPairRow({ slots }: { slots: [AdSlot, AdSlot] }): JSX.Element {
  return (
    <div className="ad-pair-row" aria-label="Publicidade">
      <p className="adsense-slot-label mb-2 text-center">Publicidade</p>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot) => (
          <AdSlotUnit key={slot.id} slot={slot} variant="pair" />
        ))}
      </div>
    </div>
  );
}
