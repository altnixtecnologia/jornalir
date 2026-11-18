"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SEEN_SESSION = "jornal-ir-pwa-invite-seen-v2";
const DISMISSED_AT = "jornal-ir-pwa-invite-dismissed-v2";
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type Device = "ios" | "android" | "desktop";
type Platform = { device: Device; needsExternalBrowser: boolean };
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  platform?: string;
};

function installedOrNative(): boolean {
  const bridge = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  if (bridge?.isNativePlatform?.() || ["ios", "android"].includes(bridge?.getPlatform?.() ?? bridge?.platform ?? "")) return true;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function deviceInfo(): Platform {
  const ua = navigator.userAgent;
  const isIpadDesktop = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const ios = /iPad|iPhone|iPod/i.test(ua) || isIpadDesktop;
  const android = /Android/i.test(ua);
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Messenger|TikTok|Line\//i.test(ua);
  // Safari é obrigatório para "Adicionar à Tela de Início" no iPhone;
  // Chrome e navegadores embutidos precisam primeiro abrir o link no Safari.
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) && !inApp;
  return {
    device: ios ? "ios" : android ? "android" : "desktop",
    needsExternalBrowser: ios ? !safari : inApp,
  };
}

function Step({ index, title, children }: { index: number; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#30305c] text-sm font-extrabold text-white">{index}</span>
      <div className="min-w-0">
        <strong className="block text-sm font-bold text-slate-900">{title}</strong>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{children}</p>
      </div>
    </li>
  );
}

/** Convite guiado no site, ou guia permanente na rota /instalar.
 * iOS exige ação manual do Safari; Android pode oferecer o prompt nativo.
 * Não troca o APK, não modifica o service worker e não pede permissões. */
export function AppInstallInvitation({ mode = "automatic" }: { mode?: "automatic" | "page" }): JSX.Element | null {
  const pathname = usePathname();
  const embedded = mode === "page";
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const promptRef = useRef<InstallPrompt | null>(null);

  useEffect(() => {
    if (!embedded && (pathname === "/instalar" || pathname === "/aplicativo" || pathname.startsWith("/sistema"))) return;

    setPlatform(deviceInfo());
    const isInstalled = installedOrNative();
    setInstalled(isInstalled);
    if (isInstalled) return;

    let seen = false;
    let dismissedRecently = false;
    try {
      seen = sessionStorage.getItem(SEEN_SESSION) === "1";
      const at = Number(localStorage.getItem(DISMISSED_AT)) || 0;
      dismissedRecently = at > 0 && Date.now() - at < REMIND_AFTER_MS;
    } catch { /* modo privado não impede o acesso ao site */ }

    const eligible = deviceInfo().device !== "desktop" && !seen && !dismissedRecently;
    const timeout = !embedded && eligible
      ? window.setTimeout(() => {
          setVisible(true);
          try { sessionStorage.setItem(SEEN_SESSION, "1"); } catch { /* opcional */ }
        }, 1800)
      : undefined;

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPrompt;
      setNativeReady(true);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
      promptRef.current = null;
      setNativeReady(false);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [pathname, embedded]);

  function dismiss(): void {
    setVisible(false);
    setGuideOpen(false);
    try { localStorage.setItem(DISMISSED_AT, String(Date.now())); } catch { /* opcional */ }
  }

  function beginInstall(): void {
    const prompt = promptRef.current;
    if (!prompt) {
      setGuideOpen(true);
      return;
    }
    // A API exige que prompt() seja chamada em resposta direta ao toque.
    promptRef.current = null;
    setNativeReady(false);
    void prompt.prompt()
      .then(() => prompt.userChoice)
      .then((choice) => {
        if (choice.outcome === "accepted") {
          setInstalled(true);
          setVisible(false);
        } else {
          setGuideOpen(true);
        }
      })
      .catch(() => setGuideOpen(true));
  }

  async function copySiteLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/");
      setCopyFeedback("Link copiado! Abra o Safari ou Chrome e cole na barra de endereço.");
    } catch {
      setCopyFeedback("Copie o endereço desta página e abra no Safari ou Chrome.");
    }
  }

  if (!platform || (installed && !embedded) || (!embedded && !visible)) return null;

  const onPhone = platform.device !== "desktop";
  const ios = platform.device === "ios";
  const android = platform.device === "android";

  return (
    <section
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : "false"}
      aria-labelledby={embedded ? "pwa-install-title-page" : "pwa-install-title-invite"}
      className={embedded
        ? "rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-9"
        : "fixed inset-x-3 bottom-20 z-[90] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:bottom-6"}
      style={embedded ? undefined : { boxShadow: "0 18px 56px rgba(27,32,63,.24)" }}
    >
      {!embedded ? (
        <button type="button" onClick={dismiss} aria-label="Fechar convite"
          className="absolute right-3 top-3 rounded-full p-2 text-slate-600 hover:bg-slate-100">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      ) : null}
      <div className="flex items-center gap-4 pr-7">
        <img src="/icons/icon-ir-192.png" alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain sm:h-16 sm:w-16" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--brand-red)" }}>Jornal IR no celular</p>
          <h2 id={embedded ? "pwa-install-title-page" : "pwa-install-title-invite"}
            className="mt-1 text-lg font-extrabold leading-snug text-slate-900 sm:text-xl">
            {installed ? "O Jornal já está instalado!" : "Tenha o Jornal na tela inicial"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {installed ? "Abra pelo ícone do celular para ler as notícias." : "Abra as notícias direto pelo ícone, sem procurar o link toda vez."}
          </p>
        </div>
      </div>

      {installed ? (
        <p className="mt-4 rounded-lg bg-green-50 px-3 py-3 text-sm text-green-900">Você já pode continuar lendo normalmente.</p>
      ) : !onPhone ? (
        <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Para colocar o Jornal na tela inicial, abra este mesmo site no iPhone ou Android.
        </p>
      ) : (
        <>
          <button type="button" onClick={beginInstall}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-extrabold text-white"
            style={{ background: "var(--brand-red)" }}>
            {android && nativeReady ? "Instalar agora" : "Quero instalar no meu celular"}
          </button>

          {(guideOpen || embedded) && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-extrabold text-slate-900">
                {ios ? "No iPhone, são só três passos:" : "Veja como instalar no Android:"}
              </p>
              <ol className="space-y-4">
                {platform.needsExternalBrowser ? (
                  <>
                    <Step index={1} title={ios ? "Abra no Safari" : "Abra no Chrome"}>
                      {ios ? "No WhatsApp ou outro aplicativo, procure “Abrir no Safari” no menu de opções. Se não aparecer, copie o link abaixo e cole no Safari." : "No WhatsApp ou outro aplicativo, abra o menu de opções e escolha “Abrir no Chrome”. Se não aparecer, copie o link."}
                    </Step>
                    <Step index={2} title={ios ? "Toque em Compartilhar" : "Abra o menu ⋮"}>
                      {ios ? "No Safari, procure o botão com um quadrado e uma seta para cima (↑)." : "No Chrome, toque nos três pontinhos, no canto superior direito."}
                    </Step>
                    <Step index={3} title={ios ? "Adicione à Tela de Início" : "Instale o aplicativo"}>
                      {ios ? "Escolha “Adicionar à Tela de Início” e confirme em “Adicionar”." : "Escolha “Instalar app” ou “Adicionar à tela inicial” e confirme."}
                    </Step>
                  </>
                ) : ios ? (
                  <>
                    <Step index={1} title="Toque em Compartilhar">
                      No Safari, toque no botão com um quadrado e uma seta para cima (↑).
                    </Step>
                    <Step index={2} title="Escolha Adicionar à Tela de Início">
                      Deslize a lista de opções até encontrar “Adicionar à Tela de Início”.
                    </Step>
                    <Step index={3} title="Confirme em Adicionar">
                      O ícone do Jornal aparecerá na tela inicial do iPhone.
                    </Step>
                  </>
                ) : (
                  <>
                    <Step index={1} title="Abra o menu do Chrome">Toque nos três pontinhos (⋮), no canto superior direito.</Step>
                    <Step index={2} title="Escolha Instalar aplicativo">Se aparecer “Adicionar à tela inicial”, pode escolher essa opção.</Step>
                    <Step index={3} title="Confirme">O ícone do Jornal aparecerá na tela inicial do Android.</Step>
                  </>
                )}
              </ol>
              {platform.needsExternalBrowser ? (
                <div className="mt-4">
                  <button type="button" onClick={() => { void copySiteLink(); }}
                    className="min-h-11 w-full rounded-xl border border-[#30305c] bg-white px-4 py-2 text-sm font-bold text-[#30305c]">
                    Copiar link para abrir no {ios ? "Safari" : "Chrome"}
                  </button>
                  {copyFeedback ? <p role="status" className="mt-2 text-xs text-slate-700">{copyFeedback}</p> : null}
                </div>
              ) : null}
              <p className="mt-4 text-xs leading-relaxed text-slate-600">
                A instalação é gratuita. No iPhone, o Safari exige esses toques; nenhum site consegue fazer isso sozinho.
              </p>
            </div>
          )}
        </>
      )}

      {embedded ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Voltar às notícias
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <button type="button" onClick={dismiss} className="min-h-11 px-3 font-semibold text-slate-600">Agora não</button>
          <Link href="/instalar" onClick={() => setVisible(false)}
            className="px-3 py-2 text-xs font-bold underline underline-offset-4" style={{ color: "var(--brand-navy)" }}>
            Ver instruções depois
          </Link>
        </div>
      )}
    </section>
  );
}
