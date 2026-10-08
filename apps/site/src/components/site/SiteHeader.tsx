"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { socialLinks } from "./siteSettings";
import { listPublicSections } from "../../lib/public/publicContentService";
import type { PublicSection } from "../../lib/public/types";

interface NavLink {
  href: string;
  label: string;
}

// Acesso permanente a todo o acervo de notícias — nunca depende de
// editorias carregadas nem de existir algo em destaque (placement
// "latestNews"): é um link estrutural fixo, sempre visível.
const NOTICIAS_LINK: NavLink = { href: "/noticias", label: "Notícias" };

// Links fixos que não são editoria — mantidos nos mesmos grupos visuais de
// antes (Jornal Online direto no header; Sobre/Contato em "Mais").
const JORNAL_ONLINE: NavLink = { href: "/jornal-online", label: "Jornal Online" };
const FIXED_OVERFLOW: NavLink[] = [
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

// Header desktop numa linha só (Ajuste pós-Fase 49 — substitui as duas
// faixas fixas da Fase 49): quantas editorias reais ficam diretas no menu
// cresce por breakpoint (mais tela = mais editorias diretas), sem JS de
// medição — cada editoria é renderizada uma única vez com a classe de
// visibilidade do seu próprio degrau; o "Mais" mostra exatamente o
// complemento em cada largura (ver `sectionTierClass`/`overflowTierClass`).
const SECTION_TIERS = { base: 3, xl: 5, "2xl": 8 } as const;

function sectionToLink(section: PublicSection): NavLink {
  return { href: `/editoria/${section.slug}`, label: section.name };
}

// Classe do link direto no nav: aparece a partir do degrau em que "cabe".
function sectionTierClass(index: number): string {
  if (index < SECTION_TIERS.base) return "inline-flex";
  if (index < SECTION_TIERS.xl) return "hidden xl:inline-flex";
  if (index < SECTION_TIERS["2xl"]) return "hidden 2xl:inline-flex";
  return "hidden";
}

// Classe do mesmo item dentro de "Mais": visível só enquanto a largura
// atual ainda não o mostra direto no nav (complemento exato da tier acima).
function overflowTierClass(index: number): string {
  if (index < SECTION_TIERS.base) return "hidden";
  if (index < SECTION_TIERS.xl) return "block xl:hidden";
  if (index < SECTION_TIERS["2xl"]) return "block 2xl:hidden";
  return "block";
}

/**
 * Menu real (Fase 31): editorias vêm de `public_editorial_sections`
 * (só `active=true`, ordenadas por `sort_order`, já a ordem da própria
 * view). Erro/vazio nunca quebra o header — cai para uma navegação
 * estrutural mínima (Início/Busca/Sobre/Contato), nunca uma lista mock
 * escondida (item 6).
 */
function useHeaderSections(): { sectionLinks: NavLink[]; allNavLinks: NavLink[] } {
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

  if (sections === null) {
    // Ainda carregando: nada de editoria por enquanto, só a estrutura
    // mínima — evita mostrar (e depois trocar) uma lista errada.
    return { sectionLinks: [], allNavLinks: [JORNAL_ONLINE, ...FIXED_OVERFLOW] };
  }

  const sectionLinks = sections.map(sectionToLink);
  const allNavLinks = [...sectionLinks, JORNAL_ONLINE, ...FIXED_OVERFLOW];
  return { sectionLinks, allNavLinks };
}

export function SiteHeader({ active }: { active?: string } = {}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [editoriasOpen, setEditoriasOpen] = useState(false);
  const [mobileNavigatingTo, setMobileNavigatingTo] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { sectionLinks, allNavLinks } = useHeaderSections();
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Auditoria de acessibilidade do menu mobile (coerência com
  // role="dialog"/aria-modal): foco entra no painel ao abrir, Tab/Shift+Tab
  // ficam presos dentro dele enquanto aberto (nunca escapam pros links da
  // página por trás, que continuam no DOM só visualmente cobertos), Escape
  // fecha, e o foco volta pro botão que abriu ao fechar (efeito abaixo).
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

  function goBack(): void {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  function handleMobileNavClick(event: MouseEvent<HTMLAnchorElement>, href: string): void {
    event.preventDefault();
    if (mobileNavigatingTo) return;
    setMobileNavigatingTo(href);
    window.setTimeout(() => setOpen(false), 500);
    window.setTimeout(() => {
      router.push(href);
      setMobileNavigatingTo(null);
    }, 850);
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

  const hasOverflow = sectionLinks.length > SECTION_TIERS.base || FIXED_OVERFLOW.length > 0;

  return (
    <header className="site-header">
      {/* Desktop (Ajuste pós-Fase 49): UMA linha só — logo à esquerda, nav
          no centro, busca/redes/Assinante à direita. Quantas editorias
          aparecem direto cresce por breakpoint (`sectionTierClass`); o
          resto some para "Mais" (`overflowTierClass` é o complemento exato
          em cada largura). Nunca uma segunda faixa fixa. */}
      <div className="site-shell flex h-[58px] items-center justify-between gap-4 lg:h-[76px]">
        <div className="flex min-w-0 items-center gap-5 xl:gap-7">
          {/* Desktop: marca oficial escrita — um pouco maior que antes da Fase 49, sem estrangular a navegação. */}
          <Link href="/" aria-label="Informativo Regional" className="hidden shrink-0 lg:inline-flex lg:items-center">
            <img src="/brand/logo-escrita.png" alt="Informativo Regional" style={{ height: 72, width: "auto" }} />
          </Link>
          {/* Mobile/tablet: símbolo oficial (transparente) + nome — melhor
              aproveitamento do espaço reduzido. `min-w-0` + o CSS de
              `.brand-mark-name strong` (nowrap/ellipsis) evitam que o nome
              quebre em duas linhas feias quando o espaço fica curto ao lado
              dos botões de voltar/menu. */}
          <Link href="/" aria-label="Informativo Regional" className="brand-mark min-w-0 lg:hidden">
            <img src="/brand/logo-ir.png" alt="" />
            <span className="brand-mark-name min-w-0">
              <strong>Informativo Regional</strong>
            </span>
          </Link>

          <nav className="hidden min-w-0 items-center gap-4 lg:flex xl:gap-5" aria-label="Navegação principal">
            <Link href="/" className={`nav-link ${isActive("/") ? "is-active" : ""}`}>
              Início
            </Link>
            <Link href={NOTICIAS_LINK.href} className={`nav-link ${isActive(NOTICIAS_LINK.href) ? "is-active" : ""}`}>
              {NOTICIAS_LINK.label}
            </Link>
            {sectionLinks.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${sectionTierClass(index)} ${isActive(item.href) ? "is-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
            <Link href={JORNAL_ONLINE.href} className={`nav-link ${isActive(JORNAL_ONLINE.href) ? "is-active" : ""}`}>
              {JORNAL_ONLINE.label}
            </Link>

            {hasOverflow ? (
              <div className="relative" onMouseEnter={() => setEditoriasOpen(true)} onMouseLeave={() => setEditoriasOpen(false)}>
                <button
                  type="button"
                  className="nav-link inline-flex items-center gap-1"
                  onClick={() => setEditoriasOpen((v) => !v)}
                  aria-expanded={editoriasOpen}
                >
                  Mais <span className="text-[9px]" aria-hidden="true">▾</span>
                </button>
                <div
                  className={`absolute left-0 top-full z-30 mt-2 w-56 rounded-lg border border-[color:var(--site-line)] bg-[color:var(--site-surface)] p-2 shadow-xl transition-all ${editoriasOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}
                >
                  {sectionLinks.map((item, index) => (
                    <Link
                      key={`${item.href}-overflow`}
                      href={item.href}
                      className={`${overflowTierClass(index)} rounded-md px-3 py-2 text-[13px] font-semibold text-[color:var(--site-text)] hover:bg-[color:var(--site-bg)] hover:text-[color:var(--brand-red)]`}
                    >
                      {item.label}
                    </Link>
                  ))}
                  {FIXED_OVERFLOW.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-md px-3 py-2 text-[13px] font-semibold text-[color:var(--site-text)] hover:bg-[color:var(--site-bg)] hover:text-[color:var(--brand-red)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/busca" aria-label="Buscar" className="icon-btn hidden md:inline-flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>

          <div className="hidden items-center gap-1.5 lg:flex">
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

          <Link href="/contato" className="nav-pill nav-pill--solid hidden sm:inline-flex">
            Assinante
          </Link>

          <button
            type="button"
            aria-label="Voltar"
            className={`ir-mobile-back-btn lg:hidden ${pathname === "/" ? "is-hidden" : ""}`}
            onClick={goBack}
          >
            ←
          </button>
          <button
            ref={mobileTriggerRef}
            type="button"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            aria-controls="ir-mobile-menu-panel"
            className={`ir-mobile-trigger lg:hidden ${open ? "is-open" : ""}`}
            onClick={() => setOpen((v) => !v)}
          >
            <i className="bar top" />
            <i className="bar middle" />
            <i className="bar bottom" />
          </button>
        </div>
      </div>

      <div className={`ir-mobile-layer lg:hidden ${open ? "is-open" : ""}`}>
        <button type="button" aria-label="Fechar menu" className="ir-mobile-backdrop" onClick={() => setOpen(false)} />
        <div id="ir-mobile-menu-panel" ref={mobilePanelRef} className="ir-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mb-4 flex items-center justify-between">
            <span className="brand-chip">
              <img src="/brand/logo-ir.png" alt="Informativo Regional" width={28} height={28} style={{ height: 22, width: "auto" }} />
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--site-line)] text-sm font-bold"
              aria-label="Fechar navegação"
            >
              ✕
            </button>
          </div>

          <Link
            href="/busca"
            onClick={(e) => handleMobileNavClick(e, "/busca")}
            className={`ir-mobile-search-cta mb-4 ${mobileNavigatingTo === "/busca" ? "is-pending" : ""}`}
          >
            🔎 Buscar no site
          </Link>

          <div>
            <Link
              href="/"
              onClick={(e) => handleMobileNavClick(e, "/")}
              className={`ir-mobile-nav-link ${mobileNavigatingTo === "/" ? "is-pending" : ""}`}
            >
              Início
            </Link>
            <Link
              href={NOTICIAS_LINK.href}
              onClick={(e) => handleMobileNavClick(e, NOTICIAS_LINK.href)}
              className={`ir-mobile-nav-link ${mobileNavigatingTo === NOTICIAS_LINK.href ? "is-pending" : ""}`}
            >
              {NOTICIAS_LINK.label}
            </Link>
            {allNavLinks.map((item) => (
              <Link
                key={`${item.href}-m`}
                href={item.href}
                onClick={(e) => handleMobileNavClick(e, item.href)}
                className={`ir-mobile-nav-link ${mobileNavigatingTo === item.href ? "is-pending" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Link href="/contato" className="nav-pill nav-pill--solid">
              Assinante
            </Link>
            <div className="flex items-center gap-2">
              {[
                { href: socialLinks.facebook, icon: "/brand/social-facebook.png", label: "Facebook" },
                { href: socialLinks.instagram, icon: "/brand/social-instagram.png", label: "Instagram" },
                { href: socialLinks.whatsapp, icon: "/brand/social-whatsapp.png", label: "WhatsApp" }
              ].map((social) => (
                <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-[color:var(--site-line)]">
                  <img src={social.icon} alt="" className="h-9 w-9 object-cover" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
