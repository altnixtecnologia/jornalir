"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "./AdminHeader";
import { MobileNav } from "./MobileNav";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getInitials } from "../../lib/auth/accountDisplay";

export function AdminShell({ children, previewMode = false }: { children: ReactNode; previewMode?: boolean }): JSX.Element {
  const menuRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

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
        <nav className="mobile-bottom-quick-nav" aria-label="Atalhos rápidos no celular">
          {([
            ["Início", "/sistema"],
            ["Agenda", "/sistema/agenda?view=agenda"],
            ["Pauta", "/sistema/agenda?view=pauta"],
            ["Matérias", "/sistema/editorial/materias"],
            ["Avisos", "/sistema/notificacoes"],
          ] as const).map(([label,href]) => (
            <Link key={label} href={href}
              aria-current={pathname === href.split("?")[0] && label !== "Pauta" ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
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
