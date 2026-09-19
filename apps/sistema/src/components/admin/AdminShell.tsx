"use client";

import { useRef, type ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export function AdminShell({ children }: { children: ReactNode }): JSX.Element {
  const menuRef = useRef<HTMLDialogElement>(null);
  return (
    <div className="admin-shell">
      <a href="#admin-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className="desktop-sidebar">
        <AdminSidebar />
      </aside>
      <dialog
        ref={menuRef}
        className="mobile-menu"
        aria-label="Menu de navegação"
        onClick={(event) => {
          if (event.target === event.currentTarget) menuRef.current?.close();
        }}
      >
        <div className="mobile-menu-inner">
          <button
            className="menu-close"
            onClick={() => menuRef.current?.close()}
            autoFocus
            aria-label="Fechar navegação"
          >
            Fechar ×
          </button>
          <AdminSidebar onNavigate={() => menuRef.current?.close()} />
        </div>
      </dialog>
      <div className="admin-workspace">
        <AdminTopbar onOpenMenu={() => menuRef.current?.showModal()} />
        <main id="admin-content" className="admin-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>JornalIR · Sistema interno</span>
          <span>Informativo Regional</span>
        </footer>
      </div>
    </div>
  );
}
