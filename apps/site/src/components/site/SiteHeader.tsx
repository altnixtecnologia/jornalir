"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { socialLinks } from "./siteSettings";
import { listPublicSections } from "../../lib/public/publicContentService";
import type { PublicSection } from "../../lib/public/types";

interface NavLink {
  href: string;
  label: string;
}

// Links fixos que não são editoria — mantidos nos mesmos grupos visuais de
// antes (Jornal Online direto no header; Sobre/Contato em "Mais").
const JORNAL_ONLINE: NavLink = { href: "/jornal-online", label: "Jornal Online" };
const FIXED_OVERFLOW: NavLink[] = [
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

// Quantas editorias reais ficam direto no header (Fase 31, item 2) — o
// resto sempre vai para "Mais", crescimento de editorias nunca aumenta a
// altura do header.
const FLAT_SECTION_COUNT = 4;

function sectionToLink(section: PublicSection): NavLink {
  return { href: `/editoria/${section.slug}`, label: section.name };
}

/**
 * Menu real (Fase 31): editorias vêm de `public_editorial_sections`
 * (só `active=true`, ordenadas por `sort_order`, já a ordem da própria
 * view). Erro/vazio nunca quebra o header — cai para uma navegação
 * estrutural mínima (Início/Busca/Sobre/Contato), nunca uma lista mock
 * escondida (item 6).
 */
function useHeaderSections(): { flatLinks: NavLink[]; overflowLinks: NavLink[] } {
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
    return { flatLinks: [], overflowLinks: FIXED_OVERFLOW };
  }

  const sectionLinks = sections.map(sectionToLink);
  const flatLinks = [...sectionLinks.slice(0, FLAT_SECTION_COUNT), JORNAL_ONLINE];
  const overflowLinks = [...sectionLinks.slice(FLAT_SECTION_COUNT), ...FIXED_OVERFLOW];
  return { flatLinks, overflowLinks };
}

export function SiteHeader({ active }: { active?: string } = {}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [editoriasOpen, setEditoriasOpen] = useState(false);
  const [mobileNavigatingTo, setMobileNavigatingTo] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { flatLinks, overflowLinks } = useHeaderSections();
  const allNavLinks = [...flatLinks, ...overflowLinks];

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
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

  return (
    <header className="site-header">
      <div className="site-shell flex h-[58px] items-center justify-between gap-4 lg:h-[76px]">
        <div className="flex items-center gap-5">
          {/* Desktop: marca oficial escrita (PNG com transparência real), renderizada direto sobre o header — sem placa/fundo. Tamanho grande o bastante para "INFORMATIVO REGIONAL" e o slogan ficarem legíveis. */}
          <Link href="/" aria-label="Informativo Regional" className="hidden lg:inline-flex lg:items-center">
            <img src="/brand/logo-escrita.png" alt="Informativo Regional" style={{ height: 64, width: "auto" }} />
          </Link>
          {/* Mobile/tablet: símbolo oficial (transparente) + nome — melhor aproveitamento do espaço reduzido. */}
          <Link href="/" aria-label="Informativo Regional" className="brand-mark lg:hidden">
            <img src="/brand/logo-ir.png" alt="" />
            <span className="brand-mark-name">
              <strong>Informativo Regional</strong>
            </span>
          </Link>

          <nav className="hidden items-center gap-4 lg:flex xl:gap-5" aria-label="Navegação principal">
            <Link href="/" className={`nav-link ${isActive("/") ? "is-active" : ""}`}>
              Início
            </Link>
            {flatLinks.map((item) => (
              <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? "is-active" : ""}`}>
                {item.label}
              </Link>
            ))}

            {overflowLinks.length > 0 ? (
              <div className="relative" onMouseEnter={() => setEditoriasOpen(true)} onMouseLeave={() => setEditoriasOpen(false)}>
                <button
                  type="button"
                  className={`nav-link inline-flex items-center gap-1 ${overflowLinks.some((i) => isActive(i.href)) ? "is-active" : ""}`}
                  onClick={() => setEditoriasOpen((v) => !v)}
                  aria-expanded={editoriasOpen}
                >
                  Mais <span className="text-[9px]" aria-hidden="true">▾</span>
                </button>
                <div
                  className={`absolute left-0 top-full z-30 mt-2 w-56 rounded-lg border border-[color:var(--site-line)] bg-[color:var(--site-surface)] p-2 shadow-xl transition-all ${editoriasOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}
                >
                  {overflowLinks.map((item) => (
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

        <div className="flex items-center gap-2">
          <Link href="/busca" aria-label="Buscar" className="icon-btn hidden md:inline-flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>

          <div className="hidden items-center gap-1.5 lg:flex">
            {[
              { href: socialLinks.facebook, label: "Facebook", icon: "/brand/social-facebook.png" },
              { href: socialLinks.instagram, label: "Instagram", icon: "/brand/social-instagram.png" },
              { href: socialLinks.whatsapp, label: "WhatsApp", icon: "/brand/social-whatsapp.png" }
            ].map((social) => (
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
            type="button"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
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
        <div className="ir-mobile-menu">
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
