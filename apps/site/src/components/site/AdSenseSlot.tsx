"use client";

import { useState } from "react";

/**
 * Reserva visual/comportamental para futura integração com Google AdSense —
 * SEM conta, script ou integração real nesta fase. Faixa de fora a fora,
 * discreta, sempre iniciando recolhida (nunca expande sozinha); o leitor
 * decide expandir/recolher. Altura fixa evita salto de layout quando o
 * anúncio real entrar no lugar.
 */
export function AdSenseSlot(): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="adsense-strip">
      <div className="site-shell flex items-center justify-between gap-3 py-1.5">
        <span className="adsense-slot-label">Espaço publicitário</span>
        <button type="button" className="adsense-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Recolher ▲" : "Expandir ▾"}
        </button>
      </div>
      {expanded ? (
        <div className="site-shell pb-3">
          <div className="adsense-slot-expanded">
            <span className="adsense-slot-label">Reserva para anúncio responsivo (Google AdSense) — integração futura</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
