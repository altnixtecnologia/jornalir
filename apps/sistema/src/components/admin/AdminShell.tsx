"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "./AdminHeader";
import { MobileNav } from "./MobileNav";
import { useAuth } from "../../lib/auth/AuthProvider";

export function AdminShell({ children }: { children: ReactNode }): JSX.Element {
  const menuRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const { signOut } = useAuth();

  async function handleLogout(): Promise<void> {
    await signOut();
    router.push("/login");
  }

  function closeMenu(): void {
    menuRef.current?.close();
  }

  return (
    <div className="admin-shell">
      <a href="#admin-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <dialog
        ref={menuRef}
        className="mobile-menu"
        aria-label="Menu de navegação"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <div className="mobile-menu-inner">
          <div className="mobile-menu-header">
            <img src="/brand/logo-ir.png" alt="Informativo Regional" className="app-brand-logo" />
            <button type="button" className="menu-close" onClick={closeMenu} autoFocus aria-label="Fechar navegação">
              ×
            </button>
          </div>
          <MobileNav onNavigate={closeMenu} />
          <div className="mobile-nav-footer">
            <button type="button" className="logout-link" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </div>
      </dialog>
      <div className="admin-workspace">
        <AdminHeader onOpenMenu={() => menuRef.current?.showModal()} />
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
