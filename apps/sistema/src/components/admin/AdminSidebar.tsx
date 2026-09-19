"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  adminModules,
  getActiveModule,
  moduleHref,
} from "../../lib/navigation";

export function AdminSidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}): JSX.Element {
  const active = getActiveModule(usePathname());
  return (
    <div className="sidebar-content">
      <Link
        className="admin-brand"
        href="/sistema"
        onClick={onNavigate}
        aria-label="JornalIR — início"
      >
        <span className="brand-monogram" aria-hidden="true">
          ir<span>.</span>
        </span>
        <span>
          <strong>JornalIR</strong>
          <small>INFORMATIVO REGIONAL</small>
        </span>
      </Link>
      <p className="nav-caption">ESPAÇO DE TRABALHO</p>
      <nav aria-label="Navegação principal">
        {adminModules.map((item, index) => (
          <Link
            key={item.slug}
            href={moduleHref(item.slug)}
            onClick={onNavigate}
            className="admin-nav-link"
            aria-current={active.slug === item.slug ? "page" : undefined}
          >
            <span className="nav-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{item.label}</span>
            {item.planned ? (
              <span className="planned-dot">
                <span className="sr-only"> — planejado</span>
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="planned-dot" /> Módulo planejado
      </div>
      <div className="sidebar-edition">
        <strong>Uma redação. Muitas histórias.</strong>
        <p>Seu jornal, em um só lugar.</p>
      </div>
    </div>
  );
}
