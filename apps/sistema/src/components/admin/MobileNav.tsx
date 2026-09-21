"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { editorialNavGroup, moreModulesNavGroup } from "../../lib/navigation";

export function MobileNav({ onNavigate }: { onNavigate: () => void }): JSX.Element {
  const pathname = usePathname();

  return (
    <nav className="mobile-nav" aria-label="Navegação">
      <Link
        href="/sistema"
        className="mobile-nav-link"
        onClick={onNavigate}
        aria-current={pathname === "/sistema" ? "page" : undefined}
      >
        Visão geral
      </Link>

      <p className="mobile-nav-heading">Editorial</p>
      {editorialNavGroup.links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`mobile-nav-link${link.primary ? " is-primary" : ""}`}
          onClick={onNavigate}
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}

      <p className="mobile-nav-heading">Mais módulos</p>
      {moreModulesNavGroup.links.map((link) => (
        <Link key={link.href} href={link.href} className="mobile-nav-link mobile-nav-link--planned" onClick={onNavigate}>
          {link.label}
          <span className="planned-dot" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
