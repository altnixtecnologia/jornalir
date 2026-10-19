"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { socialLinks } from "./siteSettings";
import { MobileSearchOverlay } from "./MobileSearchOverlay";
import { HeaderNotificationBell } from "./public/notifications/HeaderNotificationBell";
import { listPublicSections } from "../../lib/public/publicContentService";
import { getSiteAssineEnabled } from "../../lib/public/siteOfferSettingsService";
import type { PublicSection } from "../../lib/public/types";

interface NavLink {
  href: string;
  label: string;
}

const NOTICIAS_LINK: NavLink = { href: "/noticias", label: "Notícias" };
const JORNAL_ONLINE: NavLink = { href: "/jornal-online", label: "Jornal Online" };
const CONTACT_LINK: NavLink = { href: "/contato", label: "Contato" };
const CLASSIFICADOS_FALLBACK: NavLink = { href: "/editoria/classificados", label: "Classificados" };
const FIXED_OVERFLOW: NavLink[] = [{ href: "/sobre", label: "Sobre" }];

const FORCED_OVERFLOW_LABELS = new Set(["economia", "eventos", "cidades", "saúde", "saude"]);

function normalizeMenuLabel(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function isForcedOverflow(item: NavLink): boolean {
  return FORCED_OVERFLOW_LABELS.has(normalizeMenuLabel(item.label));
}

function isClassificados(item: NavLink): boolean {
  return normalizeMenuLabel(item.label) === "classificados";
}

const SECTION_TIERS = { base: 3, xl: 5, "2xl": 8 } as const;

function sectionToLink(section: PublicSection): NavLink {
  return { href: `/editoria/${section.slug}`, label: section.name };
}

function sectionTierClass(index: number): string {
  if (index < SECTION_TIERS.base) return "inline-flex";
  if (index < SECTION_TIERS.xl) return "hidden xl:inline-flex";
  if (index < SECTION_TIERS["2xl"]) return "hidden 2xl:inline-flex";
  return "hidden";
}

function overflowTierClass(index: number): string {
  if (index < SECTION_TIERS.base) return "hidden";
  if (index < SECTION_TIERS.xl) return "block xl:hidden";
  if (index < SECTION_TIERS["2xl"]) return "block 2xl:hidden";
  return "block";
}

/** Falha-fechado: começa (e permanece, se a consulta falhar) oculto —
 * nunca mostra o CTA "Assine" sem confirmação explícita de que a página
 * está habilitada (18/10/2026). */
function useAssineEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSiteAssineEnabled()
      .then((value) => {
        if (!cancelled) setEnabled(value);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

function useHeaderSections(): NavLink[] {
  const [sections, setSections] = useState<PublicSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublicSections()
      .then((data) => {
        if (!cancelled) setSections(data);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return sections?.map(sectionToLink) ?? [];
}

export function SiteHeader({ emphasized = false }: { active?: string; emphasized?: boolean } = {}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [editoriasOpen, setEditoriasOpen] = useState(false);
  const [mobileNavigatingTo, setMobileNavigatingTo] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const sectionLinks = useHeaderSections();
  const assineEnabled = useAssineEnabled();
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    document.body.classList.toggle("ir-mobile-menu-open", open);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("ir-mobile-menu-open");
    };
  }, [open]);

  useEffect(() => {
    document.body.classList.toggle("ir-mobile-search-open", searchOpen);
    return () => document.body.classList.remove("ir-mobile-search-open");
  }, [searchOpen]);

  useEffect(() => {
    if (!open) return;
    const panel = mobilePanelRef.current;
    if (!panel) return;

    function getFocusable(): HTMLElement[] {
      return Array.from(panel!.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    }

    getFocusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      mobileTriggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  function openMobileSearch(): void {
    setOpen(false);
    setSearchOpen(true);
  }

  function handleMobileNavClick(event: MouseEvent<HTMLAnchorElement>, href: string): void {
    event.preventDefault();
    if (mobileNavigatingTo) return;
    setMobileNavigatingTo(href);
    window.setTimeout(() => setOpen(false), 350);
    window.setTimeout(() => {
      router.push(href);
      setMobileNavigatingTo(null);
    }, 650);
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const socialIcons = [
    { href: socialLinks.facebook, label: "Facebook", icon: "/brand/social-facebook.png" },
    { href: socialLinks.instagram, label: "Instagram", icon: "/brand/social-instagram.png" },
    { href: socialLinks.whatsapp, label: "WhatsApp", icon: "/brand/social-whatsapp.png" },
  ];

  const classifiedLink = sectionLinks.find(isClassificados) ?? CLASSIFICADOS_FALLBACK;
  const editorialLinks = sectionLinks.filter((item) => !isClassificados(item));
  const directSectionLinks = editorialLinks.filter((item) => !isForcedOverflow(item));
  const forcedOverflowLinks = editorialLinks.filter(isForcedOverflow);
  const hasOverflow =
    directSectionLinks.length > SECTION_TIERS.base ||
    forcedOverflowLinks.length > 0 ||
    FIXED_OVERFLOW.length > 0;

  const mobileUtilityLinks: NavLink[] = [
    { href: "/", label: "Início" },
    JORNAL_ONLINE,
    CONTACT_LINK,
    ...FIXED_OVERFLOW,
  ];

  return (
    <header className={`site-header ${emphasized ? "site-header--emphasized" : ""}`}>
      {/* Desktop */}
      <div className="site-shell hidden h-[76px] items-center justify-between gap-4 lg:flex">
        <div className="flex min-w-0 items-center gap-5 xl:gap-7">
          <Link href="/" aria-label="Informativo Regional" className="shrink-0 inline-flex items-center">
            <img src="/brand/logo-escrita.png" alt="Informativo Regional" style={{ height: 72, width: "auto" }} />
          </Link>

          <nav className="flex min-w-0 items-center gap-3 xl:gap-4" aria-label="Navegação principal">
            <Link href="/" className={`nav-link nav-link--utility ${isActive("/") ? "is-active" : ""}`}>
              Início
            </Link>

            <Link href={NOTICIAS_LINK.href} className={`nav-link ${isActive(NOTICIAS_LINK.href) ? "is-active" : ""}`}>
              {NOTICIAS_LINK.label}
            </Link>

            {directSectionLinks.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${sectionTierClass(index)} ${isActive(item.href) ? "is-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}

            <Link
              href={JORNAL_ONLINE.href}
              className={`nav-link nav-link--utility nav-link--journal ${isActive(JORNAL_ONLINE.href) ? "is-active" : ""}`}
            >
              {JORNAL_ONLINE.label}
            </Link>

            {hasOverflow ? (
              <div className="relative" onMouseEnter={() => setEditoriasOpen(true)} onMouseLeave={() => setEditoriasOpen(false)}>
                <button
                  type="button"
                  className="nav-link inline-flex items-center gap-1"
                  onClick={() => setEditoriasOpen((value) => !value)}
                  aria-expanded={editoriasOpen}
                >
                  Mais <span className="text-[9px]" aria-hidden="true">▾</span>
                </button>
                <div
                  className={`absolute left-0 top-full z-30 mt-2 w-56 rounded-lg border border-[color:var(--site-line)] bg-[color:var(--site-surface)] p-2 shadow-xl transition-all ${editoriasOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}
                >
                  {directSectionLinks.map((item, index) => (
                    <Link
                      key={`${item.href}-overflow`}
                      href={item.href}
                      className={`${overflowTierClass(index)} rounded-md px-3 py-2 text-[14px] font-semibold text-[color:var(--site-text)] hover:bg-[color:var(--site-bg)] hover:text-[color:var(--brand-red)]`}
                    >
                      {item.label}
                    </Link>
                  ))}
                  {forcedOverflowLinks.map((item) => (
                    <Link
                      key={`${item.href}-forced-overflow`}
                      href={item.href}
                      className="block rounded-md px-3 py-2 text-[14px] font-semibold text-[color:var(--site-text)] hover:bg-[color:var(--site-bg)] hover:text-[color:var(--brand-red)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {FIXED_OVERFLOW.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-md px-3 py-2 text-[14px] font-semibold text-[color:var(--site-text)] hover:bg-[color:var(--site-bg)] hover:text-[color:var(--brand-red)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <Link
              href={classifiedLink.href}
              className={`nav-link nav-link--utility ${isActive(classifiedLink.href) ? "is-active" : ""}`}
            >
              {classifiedLink.label}
            </Link>

            <Link
              href={CONTACT_LINK.href}
              className={`nav-link nav-link--utility ${isActive(CONTACT_LINK.href) ? "is-active" : ""}`}
            >
              {CONTACT_LINK.label}
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/busca" aria-label="Buscar" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>

          <HeaderNotificationBell />

          <div className="flex items-center gap-1.5">
            {socialIcons.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-1 ring-[color:var(--site-line)] transition hover:ring-[color:var(--brand-navy)]"
              >
                <img src={social.icon} alt="" className="h-8 w-8 object-cover" />
              </a>
            ))}
          </div>

          {assineEnabled ? (
            <Link href="/assine" className="nav-pill nav-pill--solid">
              Assine
            </Link>
          ) : null}
        </div>
      </div>

      {/* Mobile: Assine à esquerda, IR centralizado, busca + menu à direita. */}
      <div className="site-shell ir-mobile-header h-[58px] lg:hidden">
        <div className="ir-mobile-header-left">
          {assineEnabled ? (
            <Link href="/assine" className="nav-pill nav-pill--solid mobile-assine-cta">
              Assine
            </Link>
          ) : null}
          <HeaderNotificationBell className="ir-mobile-notif-bell" />
        </div>

        <Link href="/" aria-label="Informativo Regional" className="ir-mobile-header-logo">
          <img src="/brand/logo-ir.png" alt="IR" />
        </Link>

        <div className="ir-mobile-header-actions">
          <button type="button" aria-label="Buscar" className="icon-btn" onClick={openMobileSearch}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>

          <button
            ref={mobileTriggerRef}
            type="button"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            aria-controls="ir-mobile-menu-panel"
            className={`ir-mobile-trigger ${open ? "is-open" : ""}`}
            onClick={() => setOpen((value) => !value)}
          >
            <i className="bar top" />
            <i className="bar middle" />
            <i className="bar bottom" />
          </button>
        </div>
      </div>

      <div
        className={`ir-mobile-layer lg:hidden ${open ? "is-open" : ""}`}
        aria-hidden={!open}
        {...({ inert: open ? undefined : "" } as Record<string, unknown>)}
      >
        <button type="button" aria-label="Fechar menu" className="ir-mobile-backdrop" onClick={() => setOpen(false)} />

        <div id="ir-mobile-menu-panel" ref={mobilePanelRef} className="ir-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="ir-mobile-menu-brand">
            <img src="/brand/logo-escrita.png" alt="Informativo Regional" />
            <div className="ir-mobile-menu-brand-actions">
              {/* Fechar fica só no botão do header (hambúrguer/X) — um
                  segundo X dentro do painel duplicava o controle
                  (18/10/2026). */}
              <button type="button" className="icon-btn ir-mobile-menu-search" aria-label="Buscar no site" onClick={openMobileSearch}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
            </div>
          </div>

          <p className="ir-mobile-group-label">Acessos</p>
          <div className="ir-mobile-utility-grid">
            {mobileUtilityLinks.map((item) => (
              <Link
                key={`${item.href}-utility-m`}
                href={item.href}
                onClick={(event) => handleMobileNavClick(event, item.href)}
                className={`ir-mobile-utility-link ${item.href === JORNAL_ONLINE.href ? "is-journal" : ""} ${mobileNavigatingTo === item.href ? "is-pending" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <p className="ir-mobile-group-label mt-5">Editorias</p>
          <div>
            <Link
              href={NOTICIAS_LINK.href}
              onClick={(event) => handleMobileNavClick(event, NOTICIAS_LINK.href)}
              className={`ir-mobile-nav-link ${mobileNavigatingTo === NOTICIAS_LINK.href ? "is-pending" : ""}`}
            >
              {NOTICIAS_LINK.label}
            </Link>
            {editorialLinks.map((item) => (
              <Link
                key={`${item.href}-m`}
                href={item.href}
                onClick={(event) => handleMobileNavClick(event, item.href)}
                className={`ir-mobile-nav-link ${mobileNavigatingTo === item.href ? "is-pending" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            {assineEnabled ? (
              <Link href="/assine" className="nav-pill nav-pill--solid">
                Assine
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            <div className="flex items-center gap-2">
              {socialIcons.map((social) => (
                <a
                  key={`${social.label}-menu`}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                  className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-[color:var(--site-line)]"
                >
                  <img src={social.icon} alt="" className="h-9 w-9 object-cover" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
