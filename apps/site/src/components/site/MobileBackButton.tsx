"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";

const DISMISS_SELECTORS = [
  ".lightbox-backdrop .lightbox-close",
  ".notif-panel-expanded .notif-panel-back",
  ".notif-panel .notif-panel-close",
  "#push-welcome-title ~ * [data-ir-back-dismiss]",
  "body.ir-mobile-search-open .mobile-search-backdrop",
  "body.ir-mobile-menu-open .ir-mobile-backdrop",
] as const;

function visible(node: HTMLElement): boolean {
  const style = window.getComputedStyle(node);
  return style.visibility !== "hidden" && style.display !== "none" &&
    node.getClientRects().length > 0 && !node.closest('[aria-hidden="true"]');
}

function dismissTopLayer(): boolean {
  // Galeria, detalhes do sininho, busca e menu têm prioridade sobre páginas.
  // O primeiro alvo visível fecha apenas UMA camada por pressão do botão.
  const order = [
    ...DISMISS_SELECTORS.slice(0, 3),
    '[aria-labelledby="push-welcome-title"] [data-ir-back-dismiss]',
    ...DISMISS_SELECTORS.slice(4),
  ];
  for (const selector of order) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node && visible(node)) {
      node.click();
      return true;
    }
  }

  // Outras janelas modais jamais devem causar saída/navegação por trás.
  // Dá oportunidade para o componente fechar com Escape.
  const modal = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]'
  )).find(visible);
  if (modal) {
    modal.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", code: "Escape", bubbles: true, cancelable: true,
    }));
    return true;
  }
  return false;
}

function recordRoute(stack: string[], route: string): string[] {
  if (!route) return stack;
  if (stack.length === 0) return [route];
  if (stack[stack.length - 1] === route) return stack;
  // Navegação para trás ou para entrada já conhecida: sem ciclos artificiais.
  const previous = stack.lastIndexOf(route);
  if (previous >= 0) return stack.slice(0, previous + 1);
  return [...stack, route];
}

/**
 * Um controlador único para o botão nativo do Android E a seta visual.
 * A página principal só abre o diálogo de saída se não há outras camadas
 * nem páginas anteriores neste ciclo de navegação.
 */
export function MobileBackButton(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const stackRef = useRef<string[]>([]);
  const [exitPrompt, setExitPrompt] = useState(false);
  const exitPromptRef = useRef(false);
  const [nativeReady, setNativeReady] = useState(false);
  const busyRef = useRef(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Registrar a primeira rota mesmo quando o APK é aberto pelo push.
  stackRef.current = recordRoute(stackRef.current, pathname || "/");
  exitPromptRef.current = exitPrompt;

  useEffect(() => {
    if (!exitPrompt) return;
    cancelButtonRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [exitPrompt]);

  function goBack(): void {
    if (busyRef.current) return;
    busyRef.current = true;
    window.setTimeout(() => { busyRef.current = false; }, 280);

    if (exitPromptRef.current) {
      exitPromptRef.current = false;
      setExitPrompt(false);
      return;
    }
    if (dismissTopLayer()) return;

    if (stackRef.current.length > 1) {
      // Next.js mantém a rolagem e o histórico ao voltar. A mudança real
      // de pathname atualiza stackRef, sem duplicar páginas.
      router.back();
      return;
    }
    if (pathname !== "/") {
      // APK aberto diretamente em /noticias/... por uma notificação:
      // não sair nem tentar voltar a uma Activity externa.
      stackRef.current = [];
      router.replace("/");
      return;
    }
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("App")) {
      exitPromptRef.current = true;
      setExitPrompt(true);
    }
  }

  const onBackRef = useRef(goBack);
  onBackRef.current = goBack;

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("App")) return;
    let cancelled = false;
    let handle: { remove: () => Promise<void> } | undefined;
    void import("@capacitor/app").then(async ({ App }) => {
      const registered = await App.addListener("backButton", () => {
        if (!cancelled) onBackRef.current();
      });
      if (cancelled) await registered.remove();
      else { handle = registered; setNativeReady(true); }
    }).catch(() => {
      // Nunca fingir que a captura nativa foi ativada no APK antigo.
      if (!cancelled) setNativeReady(false);
    });
    return () => {
      cancelled = true;
      if (handle) void handle.remove();
    };
  }, []);

  async function confirmExit(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("App")) {
      setExitPrompt(false);
      return;
    }
    try {
      const { App } = await import("@capacitor/app");
      await App.exitApp();
    } catch {
      // Não sair silenciosamente se o plugin estiver indisponível.
      setExitPrompt(false);
    }
  }

  return (
    <>
      {pathname !== "/" ? (
        <button type="button" className="mobile-global-back lg:hidden"
          onClick={goBack} aria-label="Voltar à página anterior">
          <span aria-hidden="true">←</span>
        </button>
      ) : null}

      {exitPrompt && nativeReady ? (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/65 p-5"
          role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="ir-exit-title"
            aria-describedby="ir-exit-description"
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
            <h2 id="ir-exit-title" className="text-xl font-bold">Sair do Jornal IR?</h2>
            <p id="ir-exit-description" className="mt-3 text-sm leading-relaxed text-slate-600">
              Você está na última página da navegação. Deseja realmente sair do aplicativo?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancelButtonRef} type="button"
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold"
                onClick={() => { exitPromptRef.current = false; setExitPrompt(false); }}>
                Cancelar
              </button>
              <button type="button" onClick={() => void confirmExit()}
                className="rounded-lg bg-[#30305c] px-5 py-3 text-sm font-bold text-white">
                Sair
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
