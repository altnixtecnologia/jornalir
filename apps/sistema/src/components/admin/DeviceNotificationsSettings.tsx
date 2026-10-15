"use client";

import { useEffect, useState } from "react";


function serverKey(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function DeviceNotificationsSettings(): JSX.Element {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    void fetch("/api/notifications/subscription", { cache: "no-store" })
      .then(async response => response.ok ? response.json() as Promise<{ publicKey?: string }> : null)
      .then(result => setVapidPublicKey(result?.publicKey ?? null))
      .catch(() => setVapidPublicKey(null));
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      setEnabled(!!subscription);
    }).catch(() => setEnabled(false));
  }, []);

  async function enable(): Promise<void> {
    if (!vapidPublicKey) {
      setMessage("O servidor de push ainda não foi ativado. Nenhuma permissão foi solicitada.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      // Sempre pedir permissão depois de uma ação do usuário.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Permissão não concedida. Altere nas configurações do navegador se desejar receber avisos.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/notification-sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey(vapidPublicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      const response = await fetch("/api/notifications/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, agenda: true }),
      });
      if (!response.ok) throw new Error("Não foi possível associar este aparelho à sua conta.");
      setEnabled(true);
      setMessage("Dispositivo cadastrado para os avisos da Agenda. A entrega automática ainda depende da ativação do serviço de push.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao configurar notificações.");
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription?.endpoint) {
        const response = await fetch("/api/notifications/subscription", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("O servidor não confirmou o desligamento.");
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Notificações desativadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível desativar as notificações.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="inline-form" style={{ marginBottom: 18 }} aria-labelledby="device-notifications-title">
      <h2 id="device-notifications-title" style={{ marginTop: 0 }}>Avisos no celular ou computador</h2>
      <p className="helper-text">Preparação para avisos de compromissos da Agenda. O Telegram continua funcionando independentemente desta configuração.</p>
      {supported === false ? (
        <p role="status">Este navegador não oferece notificações push compatíveis.</p>
      ) : !vapidPublicKey ? (
        <p role="status" className="helper-text">Cadastro de dispositivos preparado. A ativação será liberada quando o serviço de push estiver configurado.</p>
      ) : (
        <button type="button" className="header-action" onClick={() => void (enabled ? disable() : enable())} disabled={busy || supported === null}>
          {busy ? "Aguarde..." : enabled ? "Desativar avisos neste aparelho" : "Ativar avisos da Agenda neste aparelho"}
        </button>
      )}
      {message ? <p role="status" className="helper-text">{message}</p> : null}
    </section>
  );
}
