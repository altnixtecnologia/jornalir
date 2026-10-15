"use client";

import { useEffect, useState } from "react";

const API = "https://controle.altnix.com.br/api/push/subscriptions";

type KeyResponse = { publicKey: string | null; error?: string };

function decodeKey(base64url: string): Uint8Array {
  const binary = atob(base64url.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function PublicPushOptIn(): JSX.Element {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [normal, setNormal] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const available = typeof window !== "undefined" &&
      "Notification" in window && "serviceWorker" in navigator &&
      "PushManager" in window && window.isSecureContext;
    setSupported(available);
    if (available) {
      void navigator.serviceWorker.ready.then(async (registration) => {
        setSubscribed(Boolean(await registration.pushManager.getSubscription()));
      }).catch(() => {});
    }
  }, []);

  async function enable(): Promise<void> {
    if (busy || (!normal && !urgent)) return;
    setBusy(true);setMessage("");
    try {
      const response = await fetch(API, { cache: "no-store" });
      const data = await response.json() as KeyResponse;
      if (!data.publicKey) throw new Error("Notificações temporariamente indisponíveis.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Autorize as notificações nas configurações do navegador.");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: decodeKey(data.publicKey),
      });
      const keys = subscription.toJSON().keys;
      const saved = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKind: "site", endpoint: subscription.endpoint,
          keys: { p256dh: keys?.p256dh, auth: keys?.auth },
          preferences: { news: normal, urgent },
        }),
      });
      if (!saved.ok) {
        const error = await saved.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || "Não foi possível salvar o cadastro deste aparelho.");
      }
      setSubscribed(true);
      setMessage("Notificações ativadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar.");
    } finally {setBusy(false);}
  }

  async function disable(): Promise<void> {
    if (busy) return;
    setBusy(true);setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const keys = existing.toJSON().keys;
        const removed = await fetch(API, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appKind: "site", endpoint: existing.endpoint,
            keys: { auth: keys?.auth } }),
        });
        if (!removed.ok) throw new Error("Não foi possível descadastrar este aparelho.");
        await existing.unsubscribe();
      }
      setSubscribed(false);setMessage("Notificações desativadas neste aparelho.");
    } catch (error) {setMessage(error instanceof Error ? error.message : "Falha ao desativar.");}
    finally {setBusy(false);}
  }

  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold">Notificações do Jornal IR</summary>
      <div className="mt-3 grid max-w-sm gap-2">
        <p>Receba novidades e, opcionalmente, avisos de notícias urgentes.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={normal}
          onChange={(event) => setNormal(event.target.checked)} /> Notícias comuns</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={urgent}
          onChange={(event) => setUrgent(event.target.checked)} /> Notícias urgentes</label>
        <p className="text-xs">Som e vibração dependem das permissões e configurações do celular. Avisos urgentes não ignoram o modo silencioso.</p>
        {!supported ? <p className="text-xs">Este navegador não oferece Web Push neste contexto. No iPhone, instale o site na tela inicial.</p> : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || (!normal && !urgent)}
              onClick={() => void enable()} className="rounded border border-current px-3 py-2 font-semibold">
              {busy ? "Aguarde..." : subscribed ? "Salvar preferências" : "Ativar notificações"}
            </button>
            {subscribed ? <button type="button" disabled={busy} onClick={() => void disable()}
              className="rounded border border-current px-3 py-2">Desativar</button> : null}
          </div>
        )}
        {message ? <p role="status" className="text-xs">{message}</p> : null}
      </div>
    </details>
  );
}
