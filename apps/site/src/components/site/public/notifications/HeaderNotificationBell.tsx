"use client";

import { useNotificationCenter } from "./NotificationCenterContext";
import { NotificationBellIcon } from "./NotificationBellIcon";

/** Fixo e discreto, sem animação — usado no header/menu (18/10/2026). */
export function HeaderNotificationBell({ className = "" }: { className?: string }): JSX.Element {
  const { unreadCount, openPanel } = useNotificationCenter();
  return (
    <button
      type="button"
      className={`icon-btn notif-header-bell ${className}`}
      aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : "Notificações"}
      onClick={openPanel}
    >
      <NotificationBellIcon />
      {unreadCount > 0 ? <span className="notif-badge" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
    </button>
  );
}
