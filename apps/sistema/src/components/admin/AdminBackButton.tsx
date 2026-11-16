"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { recordAdminRoute, resolveAdminBackFallback } from "../../lib/adminBackNavigation";

/** Uma camada aberta tem prioridade sobre voltar a página, como no portal. */
function dismissTopLayer(): boolean {
  const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
  const openDialog = openDialogs[openDialogs.length - 1];
  if (openDialog) {
    openDialog.close();
    return true;
  }

  const modals = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]',
  ));
  const visibleModal = modals.reverse().find((modal) => {
    const style = window.getComputedStyle(modal);
    return style.display !== "none" && style.visibility !== "hidden" &&
      modal.getClientRects().length > 0;
  });
  if (visibleModal) {
    visibleModal.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", code: "Escape", bubbles: true, cancelable: true,
    }));
    return true;
  }
  return false;
}

/**
 * Botão único para TODAS as rotas internas do IR Controle, no PC/mobile/PWA.
 * Usa o histórico apenas quando este painel sabe que existe rota anterior;
 * em um deep-link, usa um destino seguro dentro do módulo.
 *
 * Não depende de @capacitor/app nem de reconstruir o APK: é parte da
 * interface web do sistema, já usada pelo WebView quando aponta ao painel.
 */
export function AdminBackButton(): JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();
  const routeStackRef = useRef<string[]>([]);
  const popStateRef = useRef(false);
  const busyRef = useRef(false);

  routeStackRef.current = recordAdminRoute(
    routeStackRef.current, pathname || "/sistema", popStateRef.current,
  );
  popStateRef.current = false;

  useEffect(() => {
    const markBack = () => { popStateRef.current = true; };
    window.addEventListener("popstate", markBack);
    return () => window.removeEventListener("popstate", markBack);
  }, []);

  if (!pathname || pathname === "/sistema" || !pathname.startsWith("/sistema/")) {
    return null;
  }

  function handleBack(): void {
    if (busyRef.current) return;
    busyRef.current = true;
    window.setTimeout(() => { busyRef.current = false; }, 280);

    if (dismissTopLayer()) return;
    if (routeStackRef.current.length > 1) {
      router.back();
      return;
    }
    // Acessos diretos (notificação/favorito) não devem sair do aplicativo.
    router.replace(resolveAdminBackFallback(pathname));
  }

  return (
    <nav className="admin-back-row" aria-label="Retorno à página anterior">
      <button type="button" className="admin-global-back" onClick={handleBack}
        aria-label="Voltar à página anterior" title="Voltar à página anterior">
        <span className="admin-global-back-arrow" aria-hidden="true">←</span>
        <span className="admin-global-back-label">Voltar</span>
      </button>
    </nav>
  );
}
