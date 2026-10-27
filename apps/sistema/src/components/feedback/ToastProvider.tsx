"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { subscribeToasts, getVisibleToasts, dismissToast, type ToastKind, type ToastRecord } from "../../lib/feedback/toastStore";

/** Monta o container global de avisos flutuantes (toasts) uma única vez,
 * em `RootProviders.tsx` — funciona em todo o IR Controle, inclusive nas
 * páginas públicas de login e definição de senha. Não é a central de
 * notificações, nem push, nem diálogo de confirmação (ver `toastStore.ts`).
 */
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const toasts = useSyncExternalStore(subscribeToasts, getVisibleToasts, getVisibleToasts);
  return (
    <>
      {children}
      {toasts.length > 0 ? (
        <div className="ir-toast-stack" role="region" aria-label="Avisos do sistema">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
        </div>
      ) : null}
    </>
  );
}

const EXIT_ANIMATION_MS = 180;

function ToastIcon({ kind }: { kind: ToastKind }): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {kind === "success" ? <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></> : null}
      {kind === "error" ? <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></> : null}
      {kind === "warning" ? <><path d="M12 3.5 21 19H3L12 3.5Z" /><path d="M12 10v4M12 17h.01" /></> : null}
    </svg>
  );
}

function ToastItem({ toast }: { toast: ToastRecord }): JSX.Element {
  const [closing, setClosing] = useState(false);
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.durationMs ?? 0);
  const startedAtRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function requestClose(): void {
    setClosing(true);
  }

  // Timer real de auto-fechamento (sucesso). Pausa/retoma preservando o
  // tempo restante — não reinicia do zero ao sair/voltar o mouse ou foco.
  useEffect(() => {
    if (toast.durationMs == null || closing) return;
    if (paused) return;
    startedAtRef.current = Date.now();
    const timeout = setTimeout(requestClose, remainingRef.current);
    return () => {
      clearTimeout(timeout);
      if (startedAtRef.current != null) {
        const elapsed = Date.now() - startedAtRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, closing]);

  // Só depois da animação de saída é que remove de verdade do store.
  useEffect(() => {
    if (!closing) return;
    closeTimeoutRef.current = setTimeout(() => dismissToast(toast.id), EXIT_ANIMATION_MS);
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [closing, toast.id]);

  return (
    <div
      className={`ir-toast ir-toast--${toast.kind}${closing ? " ir-toast--closing" : ""}`}
      role={toast.kind === "success" ? "status" : "alert"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={`ir-toast-icon ir-toast-icon--${toast.kind}`}>
        <ToastIcon kind={toast.kind} />
      </div>
      <div className="ir-toast-body">
        <p className="ir-toast-title">{toast.title}</p>
        {toast.description ? <p className="ir-toast-description">{toast.description}</p> : null}
        <div className="ir-toast-actions">
          <button type="button" className="ir-toast-ok" onClick={requestClose}>
            OK
          </button>
        </div>
      </div>
      <button type="button" className="ir-toast-close" aria-label="Fechar aviso" onClick={requestClose}>
        ×
      </button>
      {toast.durationMs != null ? (
        <div className="ir-toast-bar" aria-hidden="true">
          <div
            className="ir-toast-bar-fill"
            style={{
              animationDuration: `${toast.durationMs}ms`,
              animationPlayState: paused || closing ? "paused" : "running",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
