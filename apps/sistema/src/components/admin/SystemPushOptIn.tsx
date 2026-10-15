"use client";

import { useEffect, useState } from "react";

function decodeKey(base64url: string): Uint8Array {
  const binary = atob(base64url.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function SystemPushOptIn(): JSX.Element {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const available = typeof window !== "undefined" && "Notification" in window &&
      "serviceWorker" in navigator && "PushManager" in window && window.isSecureContext;
    setSupported(available);
    if (available) {
      void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
        if (registration) setSubscribed(Boolean(await registration.pushManager.getSubscription()));
      }).catch(() => {});
    }
  }, []);

  async function enable(): Promise<void> {
    if (busy) return;
    setBusy(true);setMessage("");
    try {
      const config = await fetch("/api/push/subscriptions", { cache: "no-store" });
      const keys = await config.json() as { publicKey?: string | null };
      if (!keys.publicKey) throw new Error("Servidor de notificações ainda não configurado.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permita notificações para o Sistema nas configurações do celular.");
      // No fetch listener: nunca armazena paginas/sessoes administrativas em cache offline.
      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: decodeKey(keys.publicKey),
      });
      const json = sub.toJSON();
      const saved = await fetch("/api/push/subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appKind: "sistema", endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          preferences: { agenda: true },
        }),
      });
      if (!saved.ok) {
        const error = await saved.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || "Não foi possível cadastrar este aparelho.");
      }
      setSubscribed(true);setMessage("Lembretes push da Agenda habilitados neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar notificações.");
    } finally {setBusy(false);}
  }

  async function disable(): Promise<void> {
    if (busy) return;
    setBusy(true);setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const response = await fetch("/api/push/subscriptions", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appKind: "sistema", endpoint: sub.endpoint,
            keys: { auth: sub.toJSON().keys?.auth },
          }),
        });
        if (!response.ok) throw new Error("Não foi possível descadastrar este aparelho.");
        await sub.unsubscribe();
      }
      setSubscribed(false);setMessage("Notificações desativadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao desativar.");
    } finally {setBusy(false);}
  }

  return (
    <section className="inline-form" aria-label="Lembretes no celular">
      <h2>Lembretes no celular</h2>
      <p className="helper-text">Receba avisos dos compromissos da Agenda atribuídos a você.
        O Telegram do grupo continua funcionando separadamente.</p>
      <p className="helper-text">Para o aparelho tocar como despertador com o aplicativo encerrado,
        ainda será necessária a integração nativa e a autorização do Android/iOS.
        O push web respeita o modo silencioso e as restrições do celular.</p>
      {!supported ? (
        <p className="helper-text">Web Push não disponível neste navegador.
          No iPhone, instale o aplicativo web na tela inicial e abra-o por lá.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" disabled={busy} onClick={() => void enable()}>
            {busy ? "Aguarde..." : subscribed ? "Reativar lembretes" : "Ativar lembretes no celular"}
          </button>
          {subscribed ? <button type="button" disabled={busy} onClick={() => void disable()}>
            Desativar neste aparelho
          </button> : null}
        </div>
      )}
      {message ? <p role="status" className="helper-text">{message}</p> : null}
    </section>
  );
}
