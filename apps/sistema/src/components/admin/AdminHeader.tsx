"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { assinaturasNavGroup, clientesNavGroup, configuracoesNavGroup, editorialNavGroup, financeiroNavGroup, nfseNavGroup, commercialNavGroup } from "../../lib/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";
import { AccountMenu } from "./AccountMenu";
import { AdminNotificationBell } from "./AdminNotificationBell";

/** Fecha os dois menus suspensos — usado ao escolher um link dentro deles. */
function closeNavDropdowns(): void {
  document
    .querySelectorAll<HTMLDetailsElement>("details[data-nav-dropdown]")
    .forEach((details) => details.removeAttribute("open"));
}

export function AdminHeader({ onOpenMenu }: { onOpenMenu: () => void }): JSX.Element {
  const pathname = usePathname();
  const { profile } = useAuth();
  const isHome = pathname === "/sistema";
  const isEditorial = pathname.startsWith("/sistema/editorial");
  const isClientes = pathname.startsWith("/sistema/clientes");
  const isAniversariantes = pathname.startsWith("/sistema/aniversariantes");
  const isAssinaturas = pathname.startsWith("/sistema/assinaturas");
  const isFinanceiro = pathname.startsWith("/sistema/financeiro");
  const isPublicidade = pathname.startsWith("/sistema/publicidade");
  const isNfse = pathname.startsWith("/sistema/nfse");
  const isConfiguracoes = pathname.startsWith("/sistema/usuarios") || pathname.startsWith("/sistema/configuracoes");
  const canManageUsers = profile?.role === "owner" || profile?.role === "admin";

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

          <Link
            href={clientesNavGroup.links[0].href}
            className="app-nav-link"
            aria-current={isClientes ? "page" : undefined}
          >
            {clientesNavGroup.label}
          </Link>

          <Link
            href="/sistema/aniversariantes"
            className="app-nav-link"
            aria-current={isAniversariantes ? "page" : undefined}
          >
            Aniversariantes
          </Link>

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

          <details className="app-nav-dropdown" data-nav-dropdown name="app-nav-dropdown">
            <summary className={`app-nav-link app-nav-summary${isFinanceiro ? " is-active" : ""}`}>
              Financeiro <span className="app-nav-caret" aria-hidden="true">▾</span>
            </summary>
            <div className="app-nav-panel">
              {financeiroNavGroup.links.map((link) => (
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
            <summary className={`app-nav-link app-nav-summary${isPublicidade ? " is-active" : ""}`}>
              Comercial <span className="app-nav-caret" aria-hidden="true">▾</span>
            </summary>
            <div className="app-nav-panel">
              {commercialNavGroup.links.map((link) => (
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
            <details className="app-nav-dropdown" data-nav-dropdown name="app-nav-dropdown">
              <summary className={`app-nav-link app-nav-summary${isNfse ? " is-active" : ""}`}>
                NFS-e <span className="app-nav-caret" aria-hidden="true">▾</span>
              </summary>
              <div className="app-nav-panel">
                {nfseNavGroup.links.map((link) => (
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
          ) : null}

          {canManageUsers ? (
            <details className="app-nav-dropdown" data-nav-dropdown name="app-nav-dropdown">
              <summary className={`app-nav-link app-nav-summary${isConfiguracoes ? " is-active" : ""}`}>
                Configurações <span className="app-nav-caret" aria-hidden="true">▾</span>
              </summary>
              <div className="app-nav-panel">
                {configuracoesNavGroup.links.map((link) => (
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
          ) : null}

        </nav>

        <div className="app-header-actions">
          <AdminNotificationBell />
          <AccountMenu />
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
