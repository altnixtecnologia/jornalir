"use client";

import { useEffect, useState } from "react";
const ENDPOINT = process.env.NEXT_PUBLIC_PUSH_GATEWAY_URL || "https://controle.altnix.com.br/api/public/push";
const TOKEN_KEY = "jornalir_push_management_token";
const PREFERENCES_KEY = "jornalir_push_choices";
type Status = "checking" | "unsupported" | "unavailable" | "ready" | "active" | "blocked";
function decodePublicKey(base64: string): Uint8Array {
  const clean = base64.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(clean + "=".repeat((4 - clean.length % 4) % 4));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
}
function matchesVapidKey(subscription: PushSubscription, publicKey: string): boolean {
  const currentKey = subscription.options.applicationServerKey;
  if (!currentKey) return false;
  const current = new Uint8Array(currentKey);
  const expected = decodePublicKey(publicKey);
  return current.length === expected.length && current.every((value, index) => value === expected[index]);
}
function platform(): "web" | "ios" | "android" {
  if (/android/i.test(navigator.userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  return "web";
}
export function SitePushPreferences(): JSX.Element {
  const [status, setStatus] = useState<Status>("checking");
  const [publicKey, setPublicKey] = useState("");
  const [ordinary, setOrdinary] = useState(true);
  const [urgent, setUrgent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("blocked");
        return;
      }
      try {
        const saved = localStorage.getItem(PREFERENCES_KEY);
        if (saved) {
          try {
            const prefs = JSON.parse(saved) as { ordinary?: boolean; urgent?: boolean };
            if (typeof prefs.ordinary === "boolean") setOrdinary(prefs.ordinary);
            if (typeof prefs.urgent === "boolean") setUrgent(prefs.urgent);
          } catch {
            // Preferências locais inválidas não devem impedir o cadastro.
            localStorage.removeItem(PREFERENCES_KEY);
          }
        }
        const configResponse = await fetch(ENDPOINT, { cache: "no-store" });
        if (!configResponse.ok) throw new Error("Serviço indisponível");
        const config = await configResponse.json() as { configured?: boolean; publicKey?: string };
        if (!config.configured || !config.publicKey) throw new Error("Serviço não configurado");
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (cancelled) return;
        setPublicKey(config.publicKey);
        const validSubscription = Boolean(
          subscription && Notification.permission === "granted" &&
          matchesVapidKey(subscription, config.publicKey) &&
          localStorage.getItem(TOKEN_KEY)
        );
        setStatus(validSubscription ? "active" : "ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function activate(): Promise<void> {
    if (busy || !publicKey) return;
    setMessage(null);
    if (!ordinary && !urgent) {
      setMessage("Escolha ao menos um tipo de notícia.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("blocked");
        setMessage("Notificações não autorizadas. Revise as permissões do navegador.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !matchesVapidKey(subscription, publicKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(publicKey) as BufferSource,
      });
      let token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
        localStorage.setItem(TOKEN_KEY, token);
      }
      const payload = subscription.toJSON();
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: { endpoint: subscription.endpoint, keys: payload.keys },
          managementToken: token,
          ordinary, urgent, platform: platform(),
        }),
      });
      const result = await response.json() as { error?: string; ok?: boolean };
      if (!response.ok || !result.ok) throw new Error(result.error || "Cadastro recusado");
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ordinary, urgent }));
      setStatus("active");
      setMessage("Preferências registradas. Você poderá receber notícias quando houver novos envios.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar notificações.");
    } finally {
      setBusy(false);
    }
  }
  async function deactivate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const token = localStorage.getItem(TOKEN_KEY);
      if (subscription && token) {
        const response = await fetch(ENDPOINT, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint, managementToken: token }),
        });
        if (!response.ok) throw new Error("Não foi possível cancelar no servidor.");
        await subscription.unsubscribe();
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PREFERENCES_KEY);
      setStatus("ready");
      setMessage("Notificações desativadas neste dispositivo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao desativar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto my-6 max-w-2xl rounded-xl border bg-white p-5 shadow-sm sm:p-7" style={{ borderColor: "var(--site-line)" }}>
      <h2 className="text-xl font-bold">Receba notícias no celular</h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
        Você decide quais avisos receber. A permissão só será solicitada quando clicar em ativar.
        É possível desativar a qualquer momento.
      </p>
      <div className="my-5 grid gap-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={ordinary} onChange={(e) => setOrdinary(e.target.checked)} className="mt-1 h-5 w-5" disabled={busy} />
          <span><strong>Notícias do dia</strong><small className="mt-1 block">Avisos de novas notícias e destaques.</small></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-1 h-5 w-5" disabled={busy} />
          <span><strong>Notícias urgentes</strong><small className="mt-1 block">Alertas importantes, com vibração quando o aparelho permitir.</small></span>
        </label>
      </div>
      {status === "checking" ? <p className="text-sm">Verificando compatibilidade...</p> : null}
      {status === "unsupported" ? <p className="text-sm">Seu navegador não suporta esse recurso. No iPhone, pode ser necessário instalar o site na Tela de Início.</p> : null}
      {status === "blocked" ? <p className="text-sm">Notificações bloqueadas nas configurações do aparelho.</p> : null}
      {status === "unavailable" ? <p className="text-sm">O serviço de notificações ainda está sendo preparado.</p> : null}
      {status === "ready" ? <button type="button" disabled={busy} onClick={() => void activate()} className="rounded-lg bg-[#30305c] px-5 py-3 font-semibold text-white">{busy ? "Ativando..." : "Ativar avisos"}</button> : null}
      {status === "active" ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void activate()} className="rounded-lg bg-[#30305c] px-5 py-3 font-semibold text-white">{busy ? "Salvando..." : "Salvar minhas preferências"}</button>
          <button type="button" disabled={busy} onClick={() => void deactivate()} className="rounded-lg border px-5 py-3 font-semibold">{busy ? "Aguarde..." : "Desativar neste dispositivo"}</button>
        </div>
      ) : null}
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
      <p className="mt-5 text-xs" style={{ color: "var(--site-muted)" }}>
        Sons personalizados não são garantidos pelos navegadores. O toque característico do Jornal IR será um recurso do aplicativo nativo.
      </p>
    </section>
  );
}
