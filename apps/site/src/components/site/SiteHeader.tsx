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

// Quantas editorias reais ficam direto no header em resolução
// INTERMEDIÁRIA (Fase 31/49, header de uma faixa só) — o resto vai para
// "Mais". Em desktop LARGO (duas faixas, Fase 49 item 6) o espaço da
// segunda faixa é dedicado só à navegação, então todas as editorias reais
// aparecem direto; "Mais" nessa faixa guarda só Sobre/Contato.
const INTERMEDIATE_FLAT_SECTION_COUNT = 3;

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
function useHeaderSections(): {
  allSectionLinks: NavLink[];
  intermediateFlat: NavLink[];
  intermediateOverflow: NavLink[];
} {
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
    return { allSectionLinks: [], intermediateFlat: [], intermediateOverflow: FIXED_OVERFLOW };
  }

  const allSectionLinks = sections.map(sectionToLink);
  const intermediateFlat = [...allSectionLinks.slice(0, INTERMEDIATE_FLAT_SECTION_COUNT), JORNAL_ONLINE];
  const intermediateOverflow = [...allSectionLinks.slice(INTERMEDIATE_FLAT_SECTION_COUNT), ...FIXED_OVERFLOW];
  return { allSectionLinks, intermediateFlat, intermediateOverflow };
}

export function SiteHeader({ active }: { active?: string } = {}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [editoriasOpen, setEditoriasOpen] = useState(false);
  const [mobileNavigatingTo, setMobileNavigatingTo] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { allSectionLinks, intermediateFlat, intermediateOverflow } = useHeaderSections();
  const allNavLinks = [...intermediateFlat, ...intermediateOverflow];

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

  const socialIcons = [
    { href: socialLinks.facebook, label: "Facebook", icon: "/brand/social-facebook.png" },
    { href: socialLinks.instagram, label: "Instagram", icon: "/brand/social-instagram.png" },
    { href: socialLinks.whatsapp, label: "WhatsApp", icon: "/brand/social-whatsapp.png" },
  ];

  return (
    <header className="site-header">
      {/* Desktop largo (Fase 49, item 6): duas faixas deliberadas — logo
          maior + utilidades numa linha, navegação completa na outra,
          aproveitando toda a largura em vez de espremer tudo numa faixa só. */}
      <div className="hidden xl:block">
        <div className="site-shell flex h-[92px] items-center justify-between gap-6">
          <Link href="/" aria-label="Informativo Regional" className="inline-flex items-center">
            <img src="/brand/logo-escrita.png" alt="Informativo Regional" style={{ height: 84, width: "auto" }} />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/busca" aria-label="Buscar" className="icon-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </Link>
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
            <Link href="/contato" className="nav-pill nav-pill--solid">
              Assinante
            </Link>
          </div>
        </div>
        <div className="border-t border-[color:var(--site-line)]">
          <nav className="site-shell flex h-14 items-center gap-5" aria-label="Navegação principal">
            <Link href="/" className={`nav-link ${isActive("/") ? "is-active" : ""}`}>
              Início
            </Link>
            <Link href={NOTICIAS_LINK.href} className={`nav-link ${isActive(NOTICIAS_LINK.href) ? "is-active" : ""}`}>
              {NOTICIAS_LINK.label}
            </Link>
            {allSectionLinks.map((item) => (
              <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? "is-active" : ""}`}>
                {item.label}
              </Link>
            ))}
            <Link href={JORNAL_ONLINE.href} className={`nav-link ${isActive(JORNAL_ONLINE.href) ? "is-active" : ""}`}>
              {JORNAL_ONLINE.label}
            </Link>
            <div className="relative" onMouseEnter={() => setEditoriasOpen(true)} onMouseLeave={() => setEditoriasOpen(false)}>
              <button
                type="button"
                className={`nav-link inline-flex items-center gap-1 ${FIXED_OVERFLOW.some((i) => isActive(i.href)) ? "is-active" : ""}`}
                onClick={() => setEditoriasOpen((v) => !v)}
                aria-expanded={editoriasOpen}
              >
                Mais <span className="text-[9px]" aria-hidden="true">▾</span>
              </button>
              <div
                className={`absolute left-0 top-full z-30 mt-2 w-56 rounded-lg border border-[color:var(--site-line)] bg-[color:var(--site-surface)] p-2 shadow-xl transition-all ${editoriasOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}
              >
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
          </nav>
        </div>
      </div>

      {/* Mobile + desktop intermediário (< xl): faixa única, conjunto direto
          reduzido, "Mais" pega o resto (Fase 49, item 6). */}
      <div className="site-shell flex h-[58px] items-center justify-between gap-4 lg:h-[76px] xl:hidden">
        <div className="flex items-center gap-5">
          {/* Desktop intermediário: marca oficial escrita, tamanho igual ao já usado antes desta fase. */}
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

          <nav className="hidden items-center gap-4 lg:flex" aria-label="Navegação principal">
            <Link href="/" className={`nav-link ${isActive("/") ? "is-active" : ""}`}>
              Início
            </Link>
            <Link href={NOTICIAS_LINK.href} className={`nav-link ${isActive(NOTICIAS_LINK.href) ? "is-active" : ""}`}>
              {NOTICIAS_LINK.label}
            </Link>
            {intermediateFlat.map((item) => (
              <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? "is-active" : ""}`}>
                {item.label}
              </Link>
            ))}

            {intermediateOverflow.length > 0 ? (
              <div className="relative" onMouseEnter={() => setEditoriasOpen(true)} onMouseLeave={() => setEditoriasOpen(false)}>
                <button
                  type="button"
                  className={`nav-link inline-flex items-center gap-1 ${intermediateOverflow.some((i) => isActive(i.href)) ? "is-active" : ""}`}
                  onClick={() => setEditoriasOpen((v) => !v)}
                  aria-expanded={editoriasOpen}
                >
                  Mais <span className="text-[9px]" aria-hidden="true">▾</span>
                </button>
                <div
                  className={`absolute left-0 top-full z-30 mt-2 w-56 rounded-lg border border-[color:var(--site-line)] bg-[color:var(--site-surface)] p-2 shadow-xl transition-all ${editoriasOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}
                >
                  {intermediateOverflow.map((item) => (
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
