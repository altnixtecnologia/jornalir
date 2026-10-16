"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  assinaturasNavGroup,
  clientesNavGroup,
  configuracoesNavGroup,
  editorialNavGroup,
  financeiroNavGroup,
  nfseNavGroup,
  commercialNavGroup,
  type AdminNavLink,
} from "../../lib/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";
import { useAgendaPautaReadAccess } from "../../lib/permissions/useAgendaPautaReadAccess";
import { useStaffModuleVisibility } from "../../lib/permissions/useStaffModuleVisibility";

type MobileGroup = { label: string; links: AdminNavLink[]; restricted?: boolean; planned?: boolean };

const GROUPS: MobileGroup[] = [
  { label: "Redação", links: [
    { label: "Agenda", href: "/sistema/agenda?view=agenda" },
    { label: "Pauta da semana", href: "/sistema/agenda?view=pauta" },
    ...editorialNavGroup.links,
  ] },
  { label: clientesNavGroup.label, links: [
    ...clientesNavGroup.links,
    { label: "Aniversariantes", href: "/sistema/aniversariantes" },
  ] },
  { label: assinaturasNavGroup.label, links: assinaturasNavGroup.links },
  { label: financeiroNavGroup.label, links: financeiroNavGroup.links },
  { label: commercialNavGroup.label, links: commercialNavGroup.links },
  { label: "Fiscal (NFS-e)", links: nfseNavGroup.links, restricted: true },
  { label: configuracoesNavGroup.label, links: configuracoesNavGroup.links, restricted: true },
];

const SHORTCUTS: AdminNavLink[] = [
  { label: "Agenda", href: "/sistema/agenda?view=agenda" },
  { label: "Pauta", href: "/sistema/agenda?view=pauta" },
  { label: "Matérias", href: "/sistema/editorial/materias" },
  { label: "Solicitações", href: "/sistema/publicidade/solicitacoes" },
  { label: "Notificações", href: "/sistema/notificacoes" },
  { label: "Preferências", href: "/sistema/preferencias-notificacoes" },
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isActive(pathname: string, href: string): boolean {
  const [route] = href.split("?");
  return pathname === route || (route !== "/sistema" && pathname.startsWith(route + "/"));
}

export function MobileNav({ onNavigate }: { onNavigate: () => void }): JSX.Element {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { agendaRead, pautaRead } = useAgendaPautaReadAccess();
  const { hasModule } = useStaffModuleVisibility();
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Qualquer toque fora do grupo aberto recolhe aquele submenu.
    function handleOutsideClick(event: PointerEvent): void {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".mobile-nav-group")) return;
      setOpenGroup(null);
    }
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, []);

  useEffect(() => {
    // Reinicia o submenu quando a rota mudar.
    setOpenGroup(null);
  }, [pathname]);
  const canManageUsers = profile?.role === "owner" || profile?.role === "admin";
  const canSeeLink = (href: string): boolean => {
    const path = href.split("?")[0];
    if (path.startsWith("/sistema/agenda")) return href.includes("view=pauta") ? pautaRead : agendaRead;
    for (const [prefix, key] of [
      ["/sistema/editorial", "editorial"],
      ["/sistema/clientes", "clientes"],
      ["/sistema/financeiro", "financeiro"],
      ["/sistema/assinaturas", "assinaturas"],
      ["/sistema/publicidade", "publicidade"],
      ["/sistema/aniversariantes", "aniversariantes"],
    ] as const) {
      if (path === prefix || path.startsWith(prefix + "/")) return hasModule(key);
    }
    return true;
  };
  const visibleGroups = GROUPS
    .filter((group) => !group.restricted || canManageUsers)
    .map((group) => ({ ...group, links: group.links.filter((link) => canSeeLink(link.href)) }))
    .filter((group) => group.links.length > 0);
  const quickLinks = SHORTCUTS.filter((link) => canSeeLink(link.href));
  const query = normalize(search);
  const close = (): void => {
    setSearch("");
    setOpenGroup(null);
    onNavigate();
  };
  const uniqueResults = new Map<string, AdminNavLink>();
  for (const group of visibleGroups.filter((item) => !item.planned)) {
    for (const link of group.links) {
      if (normalize(group.label + " " + link.label).includes(query)) uniqueResults.set(link.href, link);
    }
  }
  const searchResults = Array.from(uniqueResults.values());

  const renderLink = (link: AdminNavLink, planned = false): JSX.Element => (
    <Link
      key={link.href}
      href={link.href}
      onClick={close}
      className={"mobile-nav-link" + (link.primary ? " is-primary" : "") + (planned ? " mobile-nav-link--planned" : "")}
      aria-current={isActive(pathname, link.href) ? "page" : undefined}
    >
      {link.label}
    </Link>
  );

  return (
    <nav ref={navRef} className="mobile-nav mobile-nav-v2" aria-label="Menu do sistema">
      <label className="mobile-nav-find" htmlFor="mobile-nav-search">
        <span>Encontre rapidamente</span>
        <input
          id="mobile-nav-search"
          type="search"
          placeholder="Buscar função ou módulo..."
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {query ? (
        <section aria-label="Resultados da busca" className="mobile-nav-results">
          <p className="mobile-nav-subheading">Resultados ({searchResults.length})</p>
          {searchResults.length ? searchResults.map((link) => renderLink(link)) : (
            <p className="helper-text">Nenhuma opção encontrada. Tente outro termo.</p>
          )}
        </section>
      ) : (
        <>
          <div className="mobile-nav-shortcuts" aria-label="Acesso rápido">
            <p className="mobile-nav-subheading">Acesso rápido</p>
            <div className="mobile-nav-quick-grid">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className="mobile-nav-quick-link"
                  aria-current={isActive(pathname, link.href) ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <Link href="/sistema" onClick={close} className="mobile-nav-link mobile-nav-home" aria-current={pathname === "/sistema" ? "page" : undefined}>
            Visão geral
          </Link>
          <p className="mobile-nav-subheading">Todos os módulos</p>
          {visibleGroups.map((group) => (
              <details
                key={group.label}
                className="mobile-nav-group"
                open={openGroup === group.label}
              >
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setOpenGroup((previous) => previous === group.label ? null : group.label);
                  }}
                >
                  {group.label}<span className="mobile-nav-count">{group.links.length}</span>
                </summary>
                <div className="mobile-nav-group-links">
                  {group.links.map((link) => renderLink(link, group.planned))}
                </div>
              </details>
          ))}
        </>
      )}
    </nav>
  );
}
