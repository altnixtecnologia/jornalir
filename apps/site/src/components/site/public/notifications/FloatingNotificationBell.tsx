"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNotificationCenter } from "./NotificationCenterContext";
import { NotificationBellIcon } from "./NotificationBellIcon";

const DRAG_THRESHOLD_PX = 6;
const BUTTON_SIZE = 52;
const EDGE_MARGIN = 10;

/**
 * Sininho flutuante — só aparece com notificação não lida (18/10/2026).
 * Arrastável (mantém dentro da tela), balança por alguns segundos ao
 * aparecer, X oculta só nesta sessão sem marcar nada como lido.
 */
export function FloatingNotificationBell(): JSX.Element | null {
  const { unreadCount, floatingVisible, openPanel, dismissFloatingForSession } = useNotificationCenter();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number; dragged: boolean } | null>(null);

  if (!floatingVisible) return null;

  function clamp(nextX: number, nextY: number): { x: number; y: number } {
    const maxX = window.innerWidth - BUTTON_SIZE - EDGE_MARGIN * 2;
    const maxY = window.innerHeight - BUTTON_SIZE - EDGE_MARGIN * 2;
    return {
      x: Math.min(Math.max(nextX, -maxX), 0),
      y: Math.min(Math.max(nextY, -maxY), 0),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y, dragged: false };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragState.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) drag.dragged = true;
    if (drag.dragged) setOffset(clamp(drag.originX + dx, drag.originY + dy));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragState.current;
    dragState.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Já liberado — ignora.
    }
    if (!drag || drag.dragged) return;
    openPanel();
  }

  return (
    <div className="notif-floating-wrap" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
      <button
        type="button"
        className="notif-floating-bell"
        aria-label={`Abrir notificações (${unreadCount} não lidas)`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <NotificationBellIcon size={22} />
        <span className="notif-badge notif-badge--floating" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>
      </button>
      <button
        type="button"
        className="notif-floating-dismiss"
        aria-label="Ocultar sininho (não marca como lido)"
        onClick={(event) => {
          event.stopPropagation();
          dismissFloatingForSession();
        }}
      >
        ✕
      </button>
    </div>
  );
}
