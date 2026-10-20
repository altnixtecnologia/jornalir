"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

const MIN_DURATION_MS = 5000;

/**
 * Abertura visual do Jornal IR somente dentro do APK Capacitor.
 * Nunca aparece ao mudar de notícia/rota nem no site Chrome/PWA.
 * Porcentagem mede a animação de apresentação, não tráfego de rede.
 * O conteúdo já carregado aguarda pelo menos cinco segundos; uma página
 * ainda em carregamento mantém 95% até document.readyState=complete.
 */
export function AndroidOpeningScreen(): JSX.Element | null {
  const [percent, setPercent] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let completed = false;
    let hideTimer: number | null = null;
    const started = Date.now();
    const previousOverflow = document.body.style.overflow;
    setShow(true);
    document.body.style.overflow = "hidden";

    const timer = window.setInterval(() => {
      if (!active || completed) return;
      const elapsed = Date.now() - started;
      const prepared = document.readyState === "complete";
      if (elapsed >= MIN_DURATION_MS && prepared) {
        completed = true;
        setPercent(100);
        hideTimer = window.setTimeout(() => {
          if (active) setShow(false);
          document.body.style.overflow = previousOverflow;
        }, 180);
        window.clearInterval(timer);
      } else {
        // A barra é de apresentação; não informa percentual real de download.
        setPercent(Math.min(95, Math.round((elapsed / MIN_DURATION_MS) * 95)));
      }
    }, 60);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (hideTimer) window.clearTimeout(hideTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[16000] flex h-screen w-screen flex-col items-center justify-between overflow-hidden bg-[#282754] px-6 text-white"
         style={{ height: "100dvh", paddingTop: "max(68px, env(safe-area-inset-top, 0px))", paddingBottom: "max(56px, env(safe-area-inset-bottom, 0px))" }}
         role="status" aria-label="Iniciando Jornal IR" aria-live="off">
      <div className="flex w-full flex-1 items-center justify-center">
        <img src="/brand/logo-ir.png" alt="Logotipo completo do Jornal IR"
             className="block h-auto w-[min(60vw,240px)] max-h-[27vh] object-contain"
             draggable={false} />
      </div>
      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5">
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-white/85">Carregando aplicativo</span>
        <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/30 bg-white/20"
             role="progressbar" aria-valuemin={0} aria-valuemax={100}
             aria-valuenow={percent} aria-label="Preparação da abertura">
          <div className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear"
               style={{ width: `${percent}%` }} />
        </div>
        <span className="text-2xl font-bold tabular-nums" aria-hidden="true">{percent}%</span>
      </div>
      <div className="flex w-full flex-1 items-end justify-center">
        <p className="text-center text-lg font-bold uppercase tracking-[0.20em] sm:text-2xl">
          Informativo Regional
        </p>
      </div>
    </div>
  );
}
