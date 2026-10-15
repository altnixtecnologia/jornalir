"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth } from "../../lib/auth/AuthProvider";

type Setup = "loading" | "unsupported" | "unconfigured" | "blocked" | "ready" | "active";

function decodePublicKey(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function PushDeviceRegistration(): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const { profile, localPreview } = useAuth();
  const [setup, setSetup] = useState<Setup>("loading");
  const [key, setKey] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      if (localPreview || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setSetup("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setSetup("blocked");
        return;
      }
      try {
        const response = await fetch("/api/push/config", { cache: "no-store" });
        if (!response.ok) throw new Error("Configuração indisponível");
        const config = await response.json() as { publicKey?: string; enabled?: boolean };
        if (cancelled) return;
        if (!config.enabled || !config.publicKey) {
          setSetup("unconfigured");
          return;
        }
        setKey(config.publicKey);
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (!cancelled) setSetup(subscription ? "active" : "ready");
      } catch {
        if (!cancelled) setSetup("unconfigured");
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [localPreview]);

  async function activate(): Promise<void> {
    if (!profile || !key || working || localPreview) return;
    setWorking(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSetup("blocked");
        setMessage("O navegador não autorizou notificações. Você pode revisar a permissão nas configurações do dispositivo.");
        return;
      }
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(key) as BufferSource,
      });
      const json = subscription.toJSON();
      const endpoint = subscription.endpoint;
      if (!endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Assinatura push incompleta");
      const platform = /android/i.test(navigator.userAgent) ? "android"
        : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "web";
      const { error } = await client.from("notification_devices").upsert({
        profile_id: profile.id, app_kind: "sistema", platform,
        subscription_endpoint: endpoint, subscription_payload: json,
        enabled: true, updated_at: new Date().toISOString(),
      }, { onConflict: "app_kind,subscription_endpoint" });
      if (error) throw new Error(error.message);
      setSetup("active");
      setMessage("Dispositivo registrado. O envio das notificações depende da ativação do serviço push.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registrar este dispositivo.");
    } finally {
      setWorking(false);
    }
  }

  async function deactivate(): Promise<void> {
    if (!profile || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { error } = await client.from("notification_devices")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("profile_id", profile.id).eq("app_kind", "sistema")
          .eq("subscription_endpoint", subscription.endpoint);
        if (error) throw new Error(error.message);
        await subscription.unsubscribe();
      }
      setSetup("ready");
      setMessage("Este dispositivo foi desativado para notificações.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível desativar este dispositivo.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="form-section" aria-label="Registro do dispositivo">
      <h2>Dispositivo atual</h2>
      <p className="helper-text">O navegador pedirá permissão somente quando você escolher ativar. Receber avisos depende do serviço de envio estar configurado, mesmo após o registro.</p>
      {setup === "loading" ? <p className="helper-text">Verificando compatibilidade...</p> : null}
      {setup === "unsupported" ? <p className="helper-text">Este navegador ou modo de visualização não suporta notificações push.</p> : null}
      {setup === "unconfigured" ? <p className="helper-text">Cadastro de dispositivos preparado; aguardando a configuração de envio push.</p> : null}
      {setup === "blocked" ? <p className="helper-text">Notificações bloqueadas pelo navegador.</p> : null}
      {setup === "ready" ? <button type="button" className="form-action-primary" disabled={working} onClick={() => void activate()}>{working ? "Registrando..." : "Ativar notificações neste dispositivo"}</button> : null}
      {setup === "active" ? <button type="button" disabled={working} onClick={() => void deactivate()}>{working ? "Desativando..." : "Desativar notificações neste dispositivo"}</button> : null}
      {message ? <p role="status" className="helper-text">{message}</p> : null}
    </section>
  );
}
