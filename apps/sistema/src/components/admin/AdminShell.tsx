"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminHeader } from "./AdminHeader";
import { MobileNav } from "./MobileNav";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getInitials } from "../../lib/auth/accountDisplay";
import { useAgendaPautaReadAccess } from "../../lib/permissions/useAgendaPautaReadAccess";

export function AdminShell({ children, previewMode = false }: { children: ReactNode; previewMode?: boolean }): JSX.Element {
  const menuRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { agendaRead, pautaRead } = useAgendaPautaReadAccess();

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
            {profile ? (
              <div className="mobile-nav-account">
                <span className="account-initials" aria-hidden="true">{getInitials(profile.name)}</span>
                <span className="mobile-nav-account-name">{profile.name}</span>
              </div>
            ) : null}
            <Link href="/sistema/perfil" className="mobile-nav-link" onClick={closeMenu}>
              Meu perfil
            </Link>
            <button type="button" className="logout-link" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </div>
      </dialog>
      <div className="admin-workspace">
        {previewMode ? (
          <div className="local-preview-banner" role="status">
            Visualização local (preview) — dados de demonstração, nenhuma integração real está ativa.
          </div>
        ) : null}
        <AdminHeader onOpenMenu={() => menuRef.current?.showModal()} />
        <main id="admin-content" className="admin-content" tabIndex={-1}>
          {children}
        </main>
        <nav className="mobile-bottom-nav" aria-label="Acesso rápido do sistema">
          <Link href="/sistema" aria-current={pathname === "/sistema" ? "page" : undefined}>
            <span aria-hidden="true">⌂</span><small>Início</small>
          </Link>
          {agendaRead ? (
            <Link href="/sistema/agenda?view=agenda" aria-current={pathname.startsWith("/sistema/agenda") ? "page" : undefined}>
              <span aria-hidden="true">▦</span><small>Agenda</small>
            </Link>
          ) : null}
          {pautaRead ? (
            <Link href="/sistema/agenda?view=pauta">
              <span aria-hidden="true">☷</span><small>Pauta</small>
            </Link>
          ) : null}
          <Link href="/sistema/editorial/materias" aria-current={pathname.startsWith("/sistema/editorial/materias") ? "page" : undefined}>
            <span aria-hidden="true">▤</span><small>Matérias</small>
          </Link>
          <button type="button" onClick={() => menuRef.current?.showModal()} aria-label="Abrir todos os módulos">
            <span aria-hidden="true">☰</span><small>Menu</small>
          </button>
        </nav>
        <footer className="workspace-footer">
          <span>JornalIR · Sistema interno</span>
          <span>Informativo Regional</span>
        </footer>
      </div>
    </div>
  );
}
