"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { coverageLocations, socialLinks } from "./siteSettings";
import { menuItems } from "./menuConfig";

export function SiteHeader({ active }: { active?: "home" | "noticias" | "esportes" | "anuncios" } = {}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [locationIndex, setLocationIndex] = useState(0);
  const [mobileNavigatingTo, setMobileNavigatingTo] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const now = new Date();
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase();
  const fullDate = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const currentLocation = coverageLocations[locationIndex % coverageLocations.length];

  useEffect(() => {
    const timer = setInterval(() => {
      setLocationIndex((prev) => (prev + 1) % coverageLocations.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
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
    window.setTimeout(() => setOpen(false), 700);
    window.setTimeout(() => {
      router.push(href);
      setMobileNavigatingTo(null);
    }, 1200);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-[color:var(--site-surface)] dark:border-zinc-800 dark:bg-zinc-950">
      <div className="site-shell relative flex items-center justify-between gap-4 py-3">
        <Link href="/" aria-label="Informativo Regional">
          <Image src="/brand/logo-nova-sem-fundo.png" alt="Informativo Regional" width={620} height={150} className="h-12 w-auto md:h-16" priority />
        </Link>
        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-center md:block">
          <p className="text-sm font-extrabold tracking-wide text-zinc-900 dark:text-zinc-50">{weekday}</p>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{fullDate}</p>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <a href={socialLinks.facebook} target="_blank" aria-label="Facebook" className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full ring-1 ring-zinc-200">
            <Image src="/brand/social-facebook.png" alt="Facebook" width={48} height={48} className="h-12 w-12 object-cover" />
          </a>
          <a href={socialLinks.instagram} target="_blank" aria-label="Instagram" className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full ring-1 ring-zinc-200">
            <Image src="/brand/social-instagram.png" alt="Instagram" width={48} height={48} className="h-12 w-12 object-cover" />
          </a>
          <a href="https://youtube.com" target="_blank" aria-label="YouTube" className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full ring-1 ring-zinc-200">
            <Image src="/brand/social-youtube.png" alt="YouTube" width={48} height={48} className="h-12 w-12 object-cover" />
          </a>
          <a href={socialLinks.whatsapp} target="_blank" aria-label="WhatsApp" className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full ring-1 ring-zinc-200">
            <Image src="/brand/social-whatsapp.png" alt="WhatsApp" width={48} height={48} className="h-12 w-12 object-cover" />
          </a>
        </div>
        <button
          type="button"
          aria-label="Voltar"
          className={`ir-mobile-back-btn md:hidden ${pathname === "/" ? "is-hidden" : ""}`}
          onClick={goBack}
        >
          ←
        </button>
        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className={`ir-mobile-trigger md:hidden ${open ? "is-open" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          <i className="bar top" />
          <i className="bar middle" />
          <i className="bar bottom" />
        </button>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800">
        <nav className="site-shell hidden items-center justify-between gap-2 py-2 md:flex">
          <div className="flex items-center gap-1">
          <Link href="/busca" aria-label="Buscar no site" className="mr-1 rounded px-2 py-2 text-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">🔎</Link>
          {menuItems.map((item) => (
            <Link key={item.label} href={item.href} className="ir-nav-cta">
              <span className="ir-nav-text">{item.label}</span>
            </Link>
          ))}
          </div>
          {currentLocation ? (
            <div className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition-all dark:border-zinc-700 dark:text-zinc-300">
              {currentLocation.cidade}/{currentLocation.uf} {currentLocation.temperatura}
            </div>
          ) : null}
        </nav>
      </div>

      <div className={`ir-mobile-layer md:hidden ${open ? "is-open" : ""}`}>
        <button type="button" aria-label="Fechar menu" className="ir-mobile-backdrop" onClick={() => setOpen(false)} />
        <div className="ir-mobile-menu">
          <div className="flex h-full w-full flex-col">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-zinc-600">Navegação</p>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-bold text-zinc-700">
                Fechar ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {menuItems.map((item) => (
                <Link
                  key={`${item.label}-m`}
                  href={item.href}
                  onClick={(e) => handleMobileNavClick(e, item.href)}
                  className={`ir-nav-cta ir-mobile-nav-cta ${mobileNavigatingTo === item.href ? "is-pending" : ""}`}
                >
                  <span className="ir-nav-text">{item.label}</span>
                </Link>
              ))}
            </div>

            <div className="mt-auto pt-4">
              <Link
                href="/busca"
                onClick={(e) => handleMobileNavClick(e, "/busca")}
                className={`ir-nav-cta ir-mobile-nav-cta ir-mobile-search-cta ${mobileNavigatingTo === "/busca" ? "is-pending" : ""}`}
              >
                <span className="ir-nav-text">🔎 BUSCA</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
