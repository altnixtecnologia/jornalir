"use client";

import { usePathname } from "next/navigation";
import { getActiveModule } from "../../lib/navigation";

export function AdminTopbar({
  onOpenMenu,
}: {
  onOpenMenu: () => void;
}): JSX.Element {
  const active = getActiveModule(usePathname());
  return (
    <header className="admin-topbar">
      <div className="topbar-location">
        <button
          className="menu-button"
          onClick={onOpenMenu}
          aria-label="Abrir navegação"
          aria-haspopup="dialog"
        >
          ☰
        </button>
        <span className="topbar-parent">
          Área de trabalho <span aria-hidden="true">/</span>
        </span>
        <strong>{active.label}</strong>
      </div>
      <div className="topbar-actions">
        <a
          className="portal-link"
          href={process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}
          target="_blank"
          rel="noreferrer"
        >
          Ver portal ↗
        </a>
        <span className="environment-label">
          <span aria-hidden="true" /> Ambiente de demonstração
        </span>
      </div>
    </header>
  );
}
