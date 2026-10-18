"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotificationCenter, type NotificationItem } from "./NotificationCenterContext";

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const KIND_LABEL: Record<NotificationItem["kind"], string> = {
  ordinary: "Notícia",
  urgent: "Urgente",
  administrative: "Aviso geral",
};

export function NotificationPanel(): JSX.Element | null {
  const { items, panelOpen, closePanel, markRead } = useNotificationCenter();
  const [expanded, setExpanded] = useState<NotificationItem | null>(null);
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) {
      setExpanded(null);
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") closePanel();
    }
    function handleOutside(event: PointerEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) closePanel();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleOutside);
    };
  }, [panelOpen, closePanel]);

  if (!panelOpen) return null;

  function handleItemClick(item: NotificationItem): void {
    markRead(item.id);
    if (item.kind === "administrative") {
      // Recado institucional/comercial: mostra o conteúdo aqui mesmo.
      setExpanded(item);
      return;
    }
    // Notícia: abre a matéria direto.
    closePanel();
    if (item.href) router.push(item.href);
  }

  return (
    <div className="notif-panel-overlay" role="presentation">
      <div ref={panelRef} className="notif-panel" role="dialog" aria-modal="true" aria-label="Notificações">
        <div className="notif-panel-header">
          <h2>Notificações</h2>
          <button type="button" className="notif-panel-close" aria-label="Fechar notificações" onClick={closePanel}>
            ✕
          </button>
        </div>

        {expanded ? (
          <div className="notif-panel-expanded">
            <button type="button" className="notif-panel-back" onClick={() => setExpanded(null)}>
              ‹ Voltar
            </button>
            <p className="notif-panel-expanded-kind">{KIND_LABEL[expanded.kind]}</p>
            <h3>{expanded.title}</h3>
            <p className="notif-panel-expanded-time">{timeLabel(expanded.scheduledAt)}</p>
            <p className="notif-panel-expanded-body">{expanded.body}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="notif-panel-empty">
            <p>Nenhuma notificação por aqui ainda.</p>
            <p>Avisos de notícias e comunicados aparecerão nesta lista.</p>
          </div>
        ) : (
          <ul className="notif-panel-list">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className={`notif-panel-item ${item.read ? "is-read" : ""}`} onClick={() => handleItemClick(item)}>
                  <span className={`notif-panel-item-kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                  <strong className="notif-panel-item-title">{item.title}</strong>
                  <span className="notif-panel-item-body">{item.body}</span>
                  <span className="notif-panel-item-time">{timeLabel(item.scheduledAt)}</span>
                  {!item.read ? <span className="notif-panel-item-dot" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
