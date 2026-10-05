"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { assinaturasNavGroup, clientesNavGroup, editorialNavGroup, moreModulesNavGroup } from "../../lib/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";

/** Fecha os dois menus suspensos — usado ao escolher um link dentro deles. */
function closeNavDropdowns(): void {
  document
    .querySelectorAll<HTMLDetailsElement>("details[data-nav-dropdown]")
    .forEach((details) => details.removeAttribute("open"));
}

export function AdminHeader({ onOpenMenu }: { onOpenMenu: () => void }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const isHome = pathname === "/sistema";
  const isEditorial = pathname.startsWith("/sistema/editorial");
  const isClientes = pathname.startsWith("/sistema/clientes");
  const isAssinaturas = pathname.startsWith("/sistema/assinaturas");
  const isUsuarios = pathname.startsWith("/sistema/usuarios");
  const isMore = moreModulesNavGroup.links.some((link) => pathname.startsWith(link.href));
  const canManageUsers = profile?.role === "owner" || profile?.role === "admin";

  async function handleLogout(): Promise<void> {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/sistema" className="app-brand" aria-label="Informativo Regional — início">
          <img src="/brand/logo-escrita.png" alt="Informativo Regional" className="app-brand-logo" />
        </Link>

        <nav className="app-nav" aria-label="Navegação principal">
          <Link href="/sistema" className="app-nav-link" aria-current={isHome ? "page" : undefined}>
            Visão geral
          </Link>

          <details className="app-nav-dropdown" data-nav-dropdown name="app-nav-dropdown">
            <summary className={`app-nav-link app-nav-summary${isEditorial ? " is-active" : ""}`}>
              Editorial <span className="app-nav-caret" aria-hidden="true">▾</span>
            </summary>
            <div className="app-nav-panel">
              {editorialNavGroup.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`app-nav-panel-link${link.primary ? " is-primary" : ""}`}
                  onClick={closeNavDropdowns}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </details>

          <details className="app-nav-dropdown" data-nav-dropdown name="app-nav-dropdown">
            <summary className={`app-nav-link app-nav-summary${isClientes ? " is-active" : ""}`}>
              Clientes <span className="app-nav-caret" aria-hidden="true">▾</span>
            </summary>
            <div className="app-nav-panel">
              {clientesNavGroup.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`app-nav-panel-link${link.primary ? " is-primary" : ""}`}
                  onClick={closeNavDropdowns}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </details>

          <details className="app-nav-dropdown" data-nav-dropdown name="app-nav-dropdown">
            <summary className={`app-nav-link app-nav-summary${isAssinaturas ? " is-active" : ""}`}>
              Assinaturas <span className="app-nav-caret" aria-hidden="true">▾</span>
            </summary>
            <div className="app-nav-panel">
              {assinaturasNavGroup.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`app-nav-panel-link${link.primary ? " is-primary" : ""}`}
                  onClick={closeNavDropdowns}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </details>

          {canManageUsers ? (
            <Link
              href="/sistema/usuarios"
              className="app-nav-link"
              aria-current={isUsuarios ? "page" : undefined}
            >
              Usuários
            </Link>
          ) : null}

          <div className="app-nav-direct-modules" aria-label="Outros módulos">
            {moreModulesNavGroup.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`app-nav-link app-nav-link--module${pathname.startsWith(link.href) ? " is-active" : ""}`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <details className="app-nav-dropdown app-nav-more" data-nav-dropdown name="app-nav-dropdown">
            <summary className={`app-nav-link app-nav-summary${isMore ? " is-active" : ""}`}>
              Mais módulos <span className="app-nav-caret" aria-hidden="true">▾</span>
            </summary>
            <div className="app-nav-panel">
              {moreModulesNavGroup.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="app-nav-panel-link app-nav-panel-link--planned"
                  onClick={closeNavDropdowns}
                >
                  {link.label}
                  <span className="planned-dot" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="app-header-actions">
          {profile ? <span className="current-user-name">{profile.name}</span> : null}
          <button type="button" className="logout-link" onClick={handleLogout}>
            Sair
          </button>
          <button
            type="button"
            className="menu-button"
            onClick={onOpenMenu}
            aria-label="Abrir navegação"
            aria-haspopup="dialog"
          >
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}
