"use client";

import { useMemo, useState, useEffect } from "react";
import { socialLinks } from "./siteSettings";

function TopIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-black text-white transition hover:border-zinc-400 hover:bg-zinc-900"
    >
      {children}
    </a>
  );
}

function IconFacebook(): JSX.Element {
  return <span className="text-sm font-bold">f</span>;
}

function IconInstagram(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5A5.5 5.5 0 1 1 6.5 13 5.5 5.5 0 0 1 12 7.5Zm0 2A3.5 3.5 0 1 0 15.5 13 3.5 3.5 0 0 0 12 9.5Zm5.8-3.1a1.2 1.2 0 1 1-1.2 1.2 1.2 1.2 0 0 1 1.2-1.2Z"/>
    </svg>
  );
}

function IconX(): JSX.Element {
  return <span className="text-sm font-bold">X</span>;
}

function IconYoutube(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="currentColor" d="M23 12s0-3.5-.4-5.2a2.9 2.9 0 0 0-2-2C18.8 4.3 12 4.3 12 4.3s-6.8 0-8.6.5a2.9 2.9 0 0 0-2 2C1 8.5 1 12 1 12s0 3.5.4 5.2a2.9 2.9 0 0 0 2 2c1.8.5 8.6.5 8.6.5s6.8 0 8.6-.5a2.9 2.9 0 0 0 2-2C23 15.5 23 12 23 12Zm-13.7 3.7V8.3L16 12l-6.7 3.7Z"/>
    </svg>
  );
}

function IconTiktok(): JSX.Element {
  return <span className="text-xs font-bold">Tik</span>;
}

function formatNow(now: Date): string {
  return now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
}

export function UtilityBar(): JSX.Element {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const dateText = useMemo(() => formatNow(now), [now]);

  return (
    <section className="mb-4 border-b border-zinc-700 bg-gradient-to-r from-black to-zinc-900 py-2 text-white">
      <div className="site-shell flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TopIcon href={socialLinks.facebook} label="Facebook"><IconFacebook /></TopIcon>
          <TopIcon href={socialLinks.instagram} label="Instagram"><IconInstagram /></TopIcon>
          <TopIcon href={socialLinks.facebook} label="X"><IconX /></TopIcon>
          <TopIcon href={socialLinks.instagram} label="YouTube"><IconYoutube /></TopIcon>
          <TopIcon href={socialLinks.whatsapp} label="TikTok"><IconTiktok /></TopIcon>
        </div>
        <p className="text-xs font-bold tracking-[0.08em] md:text-base">{dateText}</p>
      </div>
    </section>
  );
}
