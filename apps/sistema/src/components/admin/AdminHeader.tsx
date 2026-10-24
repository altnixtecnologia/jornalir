"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clientesNavGroup, configuracoesNavGroup, editorialNavGroup, financeiroNavGroup, nfseNavGroup, commercialNavGroup } from "../../lib/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";
import { useAgendaPautaReadAccess } from "../../lib/permissions/useAgendaPautaReadAccess";
import { useAuditReadAccess } from "../../lib/permissions/useAuditReadAccess";
import { useStaffModuleVisibility } from "../../lib/permissions/useStaffModuleVisibility";
import { AccountMenu } from "./AccountMenu";
import { AdminNotificationBell } from "./AdminNotificationBell";
import { NFSE_AVAILABLE_IN_THIS_RELEASE } from "../../lib/release/releasePolicy";

/** Fecha os dois menus suspensos — usado ao escolher um link dentro deles. */
function closeNavDropdowns(): void {
  document
    .querySelectorAll<HTMLDetailsElement>("details[data-nav-dropdown]")
    .forEach((details) => details.removeAttribute("open"));
}

export function AdminHeader({ onOpenMenu }: { onOpenMenu: () => void }): JSX.Element {
  const pathname = usePathname();
  const [nativeMobile, setNativeMobile] = useState(false);
  useEffect(() => {
    const bridge = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    const inNativeApp = bridge?.isNativePlatform?.() === true || bridge?.getPlatform?.() === "android";
    // WebView em versões antigas sem ponte: manter distância da câmera.
    const inAndroidWebView = /Android/i.test(navigator.userAgent) && /;\s*wv[);]/i.test(navigator.userAgent);
    setNativeMobile(inNativeApp || inAndroidWebView);
  }, []);

  useEffect(() => {
    // <details> não fecha sozinho ao clicar fora da lista.
    // O listener é único para todos os menus superiores, sem interferir
    // no clique de uma opção dentro do menu.
    function handleOutsideClick(event: PointerEvent): void {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("details[data-nav-dropdown]")) return;
      closeNavDropdowns();
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") closeNavDropdowns();
    }
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    closeNavDropdowns(); // inclui navegação para outra página.
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [pathname]);
  const { profile } = useAuth();
  const { agendaRead, pautaRead } = useAgendaPautaReadAccess();
  const auditRead = useAuditReadAccess();
  const { hasModule } = useStaffModuleVisibility();
  const isHome = pathname === "/sistema";
  const isEditorial = pathname.startsWith("/sistema/editorial");
  const isAgenda = pathname.startsWith("/sistema/agenda") || pathname.startsWith("/sistema/pauta");
  const isClientes = pathname.startsWith("/sistema/clientes");
  const isAniversariantes = pathname.startsWith("/sistema/aniversariantes");
  const isAssinaturas = pathname.startsWith("/sistema/assinaturas");
  const isFinanceiro = pathname.startsWith("/sistema/financeiro");
  const isPublicidade = pathname.startsWith("/sistema/publicidade");
  const isNfse = pathname.startsWith("/sistema/nfse");
  const isConfiguracoes = pathname.startsWith("/sistema/usuarios") || pathname.startsWith("/sistema/configuracoes") || pathname.startsWith("/sistema/assistente-ir");
  const canManageUsers = Boolean(profile?.active && (profile.role === "owner" || profile.role === "admin"));

  return (
    <header className={"app-header" + (nativeMobile ? " is-native-mobile" : "")}>
      <div className="app-header-inner">
        <Link href="/sistema" className="app-brand" aria-label="Informativo Regional — início">
          <img src="/brand/logo-escrita.png" alt="Informativo Regional" className="app-brand-logo" />
        </Link>

        <nav className="app-nav" aria-label="Navegação principal">
          <Link href="/sistema" className="app-nav-link" aria-current={isHome ? "page" : undefined}>
            Visão geral
          </Link>

          {hasModule("editorial") ? (
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
          ) : null}

          {agendaRead || pautaRead ? (
            <Link
              href={agendaRead ? "/sistema/agenda" : "/sistema/pauta"}
              className="app-nav-link"
              aria-current={isAgenda ? "page" : undefined}
            >
              {agendaRead ? "Agenda" : "Pauta"}
            </Link>
          ) : null}

          {hasModule("clientes") ? (
          <Link
            href={clientesNavGroup.links[0].href}
            className="app-nav-link"
            aria-current={isClientes ? "page" : undefined}
          >
            {clientesNavGroup.label}
          </Link>
          ) : null}

          {hasModule("aniversariantes") ? (
          <Link
            href="/sistema/aniversariantes"
            className="app-nav-link"
            aria-current={isAniversariantes ? "page" : undefined}
          >
            Aniversariantes
          </Link>
          ) : null}

          {hasModule("assinaturas") ? (
            <Link href="/sistema/assinaturas" className="app-nav-link"
              aria-current={isAssinaturas ? "page" : undefined}>
              Assinaturas
            </Link>
          ) : null}

          {hasModule("financeiro") ? (
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
          ) : null}

          {hasModule("publicidade") ? (
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
          ) : null}

          {NFSE_AVAILABLE_IN_THIS_RELEASE && canManageUsers ? (
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

          {auditRead && !canManageUsers ? (
            <Link href="/sistema/configuracoes/auditoria" className="app-nav-link"
              aria-current={pathname === "/sistema/configuracoes/auditoria" ? "page" : undefined}>
              Atividades
            </Link>
          ) : null}
          {canManageUsers ? (
            <details className="app-nav-dropdown" data-nav-dropdown name="app-nav-dropdown">
              <summary className={`app-nav-link app-nav-summary${isConfiguracoes ? " is-active" : ""}`}>
                Configurações <span className="app-nav-caret" aria-hidden="true">▾</span>
              </summary>
              <div className="app-nav-panel">
                {(() => {
                  const visible = configuracoesNavGroup.links.filter(
                    (link) => !link.ownerOnly || (profile?.active && profile.role === "owner"),
                  );
                  const rendered: JSX.Element[] = [];
                  for (let index = 0; index < visible.length; index += 1) {
                    const link = visible[index];
                    if (link.group) {
                      if (visible[index - 1]?.group === link.group) continue; // já renderizado no bloco do grupo.
                      const groupLinks = visible.filter((item) => item.group === link.group);
                      rendered.push(
                        // Submenu recolhível (fechado por padrão) — evita o bloco
                        // JoIR poluir "Configurações" sempre expandido (18/10/2026).
                        <details key={link.group} className="app-nav-subgroup">
                          <summary className="app-nav-subgroup-summary">{link.group}</summary>
                          {groupLinks.map((groupLink) => (
                            <Link
                              key={groupLink.href}
                              href={groupLink.href}
                              className={`app-nav-panel-link${groupLink.primary ? " is-primary" : ""}`}
                              style={{ paddingLeft: 26 }}
                              onClick={closeNavDropdowns}
                            >
                              {groupLink.label}
                            </Link>
                          ))}
                        </details>,
                      );
                      continue;
                    }
                    rendered.push(
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`app-nav-panel-link${link.primary ? " is-primary" : ""}`}
                        onClick={closeNavDropdowns}
                      >
                        {link.label}
                      </Link>,
                    );
                  }
                  return rendered;
                })()}
              </div>
            </details>
          ) : null}

        </nav>

        <div className="ir-header-bell"><AdminNotificationBell /></div>
        <div className="app-header-actions">
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
