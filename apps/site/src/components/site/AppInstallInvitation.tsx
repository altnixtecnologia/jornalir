"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getPublishedAndroidRelease } from "../../lib/public/mobileAppReleaseService";

const SEEN_THIS_VISIT = "jornal-ir-app-invite-seen-session-v1";
const ALREADY_INSTALLED = "jornal-ir-app-already-installed-v1";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  platform?: string;
};

function isInsideAppOrStandalone(): boolean {
  const bridge = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  if (bridge?.isNativePlatform?.() === true || bridge?.getPlatform?.() === "android" ||
      bridge?.getPlatform?.() === "ios" || bridge?.platform === "android" || bridge?.platform === "ios") {
    return true;
  }
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function AppInstallInvitation(): JSX.Element | null {
  const pathname = usePathname();
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    // O APK é Android. Não pedir instalação no desktop, iPhone, dentro do
    // aplicativo Capacitor ou em um site instalado como PWA.
    if (!/Android/i.test(navigator.userAgent) || isInsideAppOrStandalone() ||
        pathname === "/aplicativo" || pathname.startsWith("/sistema")) return;

    try {
      if (sessionStorage.getItem(SEEN_THIS_VISIT) === "1" ||
          localStorage.getItem(ALREADY_INSTALLED) === "1") return;
    } catch {
      // Navegação privada pode bloquear storage; o convite ainda funciona.
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    // Nunca mostrar um botão de instalação enquanto não houver APK liberado.
    getPublishedAndroidRelease().then((release) => {
      if (cancelled || !release) return;
      timeoutId = window.setTimeout(() => {
        if (cancelled || isInsideAppOrStandalone()) return;
        try { sessionStorage.setItem(SEEN_THIS_VISIT, "1"); } catch { /* bloqueado */ }
        setDownloadUrl(release.downloadUrl);
      }, 1400);
    }).catch(() => {
      // Sem rede, tabela indisponível ou lançamento não publicado: não exibir.
    });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [pathname]);

  if (!downloadUrl) return null;

  function close(): void {
    setDownloadUrl(null);
  }

  function alreadyHaveApp(): void {
    try { localStorage.setItem(ALREADY_INSTALLED, "1"); } catch { /* bloqueado */ }
    close();
  }

  return (
    <aside
      role="region"
      aria-label="Convite para instalar o aplicativo Jornal IR"
      className="fixed inset-x-3 bottom-20 z-[80] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:bottom-6"
      style={{ boxShadow: "0 18px 56px rgba(27, 32, 63, 0.24)" }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Fechar convite"
        className="absolute right-3 top-3 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="flex gap-3 pr-7">
        <img src="/icons/icon-ir-192.png" alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--brand-red)" }}>Jornal IR no celular</p>
          <h2 className="mt-1 text-lg font-extrabold leading-snug text-slate-900">Acompanhe nossa região pelo aplicativo!</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">Acesse as notícias e receba nossos avisos diretamente no Android.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold text-white"
          style={{ background: "var(--brand-red)" }}
        >
          Baixar aplicativo
        </a>
        <button type="button" onClick={close} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">
          Agora não
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <Link href="/aplicativo" onClick={close} className="font-semibold underline" style={{ color: "var(--brand-navy)" }}>
          Como instalar
        </Link>
        <button type="button" onClick={alreadyHaveApp} className="text-slate-500 underline underline-offset-2">
          Já tenho o aplicativo
        </button>
      </div>
    </aside>
  );
}
