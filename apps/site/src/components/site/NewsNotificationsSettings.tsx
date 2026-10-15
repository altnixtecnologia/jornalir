"use client";
import { useEffect, useState } from "react";

const api = "https://controle.altnix.com.br/api/notifications/site-subscription";

function vapidKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const decoded = atob(base64);
  const result = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) result[i] = decoded.charCodeAt(i);
  return result;
}

export function NewsNotificationsSettings(): JSX.Element {
  const [news, setNews] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [compatible, setCompatible] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setCompatible(false);
      setReady(true);
      return;
    }
    void fetch(api, { cache: "no-store" })
      .then(async response => response.ok ? response.json() as Promise<{ publicKey: string; enabled: boolean }> : null)
      .then(async payload => {
        if (payload?.enabled && payload.publicKey) setPublicKey(payload.publicKey);
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setEnabled(!!subscription);
      })
      .catch(() => setMessage("Não foi possível consultar o serviço de avisos."))
      .finally(() => setReady(true));
  }, []);

  async function subscribe(): Promise<void> {
    if (!publicKey || (!news && !urgent)) {
      setMessage("Escolha pelo menos um tipo de notícia.");
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Permissão não concedida. Você poderá ativá-la nas configurações do navegador.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey(publicKey) as BufferSource,
        });
      const record = subscription.toJSON();
      const response = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: record.endpoint, keys: record.keys, news, urgent }),
      });
      if (!response.ok) throw new Error("O serviço não confirmou o cadastro. Tente novamente mais tarde.");
      setEnabled(true);
      setMessage("Avisos ativados neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao ativar as notícias.");
    } finally { setProcessing(false); }
  }

  async function unsubscribe(): Promise<void> {
    setProcessing(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch(api, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Não foi possível confirmar o desligamento.");
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Avisos desativados neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao desativar os avisos.");
    } finally { setProcessing(false); }
  }

  return (
    <div className="mt-6 max-w-lg space-y-4 rounded-xl border border-[color:var(--site-line)] bg-white p-5">
      <h2 className="text-lg font-bold">Notícias no seu celular</h2>
      <p className="text-sm text-[color:var(--site-muted)]">
        Você escolhe o que deseja receber e pode desativar a qualquer momento.
        O modo silencioso e as configurações do aparelho podem impedir som e vibração.
      </p>
      {!compatible ? (
        <p role="status" className="text-sm">Seu navegador não oferece suporte a Web Push.</p>
      ) : !ready ? (
        <p role="status" className="text-sm">Verificando suporte...</p>
      ) : !publicKey ? (
        <p role="status" className="text-sm">As inscrições de notícias serão liberadas em breve.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={news} onChange={e => setNews(e.target.checked)} disabled={processing} />
            Notícias do Jornal IR
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} disabled={processing} />
            Notícias urgentes (com prioridade de notificação)
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void subscribe()} disabled={processing || (!news && !urgent)}
              className="rounded-md bg-[#30305c] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
              {processing ? "Aguarde..." : enabled ? "Atualizar preferências" : "Ativar avisos"}
            </button>
            {enabled ? (
              <button type="button" onClick={() => void unsubscribe()} disabled={processing}
                className="rounded-md border px-4 py-3 text-sm font-semibold">
                Desativar avisos
              </button>
            ) : null}
          </div>
        </>
      )}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </div>
  );
}
