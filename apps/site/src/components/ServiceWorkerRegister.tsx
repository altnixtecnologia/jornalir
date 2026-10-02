"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // In dev we explicitly unregister old SW to avoid stale cached pages.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      return;
    }

    // Só uma troca de SW que estava CONTROLANDO esta aba é uma atualização
    // de verdade (v1 -> v2). Sem essa checagem, todo visitante novo (sem
    // controller nenhum ainda) levaria um reload surpresa na primeira
    // visita, já que o primeiro SW instalado também disparam "controllerchange".
    const hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Força a verificação de uma versão nova do SW já no carregamento,
        // em vez de depender só da checagem periódica do navegador — é o
        // que garante que o SW v2 (cache-first só para assets estáticos,
        // nunca para navegação) substitua o v1 sem o usuário precisar
        // limpar cache manualmente.
        registration.update().catch(() => {});
      })
      .catch(() => {
        // Silent fail keeps UX clean if browser blocks registration.
      });

    // Quando o novo SW assume o controle (skipWaiting + clients.claim),
    // a aba atual ainda pode ter sido controlada pelo SW antigo durante
    // essa navegação — um único reload garante que a próxima leitura já
    // use o SW novo (navegação sempre via rede), sem reload em loop.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  return null;
}
