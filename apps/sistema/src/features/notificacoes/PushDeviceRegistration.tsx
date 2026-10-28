"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth } from "../../lib/auth/AuthProvider";
import { sendMyPushTestAction } from "./actions";
import { notify } from "../../lib/feedback/notify";

type Setup = "loading" | "unsupported" | "unconfigured" | "blocked" | "ready" | "active";

function decodePublicKey(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function matchesServerKey(subscription: PushSubscription, key: string): boolean {
  const registered = subscription.options.applicationServerKey;
  if (!registered) return false;
  const current = new Uint8Array(registered);
  const expected = decodePublicKey(key);
  return current.length === expected.length && current.every((value, index) => value === expected[index]);
}

export function PushDeviceRegistration(): JSX.Element {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const { profile, localPreview } = useAuth();
  const [setup, setSetup] = useState<Setup>("loading");
  const [key, setKey] = useState("");
  const [working, setWorking] = useState(false);

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
        if (!subscription || !matchesServerKey(subscription, config.publicKey) || !profile?.id) {
          if (!cancelled) setSetup("ready");
          return;
        }
        const { data, error } = await client.from("notification_devices")
          .select("id")
          .eq("profile_id", profile.id)
          .eq("app_kind", "sistema")
          .eq("subscription_endpoint", subscription.endpoint)
          .eq("enabled", true)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw new Error(error.message);
        setSetup(data ? "active" : "ready");
      } catch {
        if (!cancelled) setSetup("unconfigured");
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [client, localPreview, profile?.id]);

  async function activate(): Promise<void> {
    if (!profile || !key || working || localPreview) return;
    setWorking(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSetup("blocked");
        notify.warning("Notificações bloqueadas", "O navegador não autorizou notificações. Você pode revisar a permissão nas configurações do dispositivo.");
        return;
      }
      let existing = await registration.pushManager.getSubscription();
      if (existing && !matchesServerKey(existing, key)) {
        await existing.unsubscribe();
        existing = null;
      }
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
      notify.success("Dispositivo registrado", "O envio das notificações depende da ativação do serviço push.");
    } catch (error) {
      notify.error("Dispositivo não registrado", error instanceof Error ? error.message : "Não foi possível registrar este dispositivo.");
    } finally {
      setWorking(false);
    }
  }

  async function sendTest(): Promise<void> {
    if (working || !profile) return;
    setWorking(true);
    try {
      const result = await sendMyPushTestAction(crypto.randomUUID());
      if (result.error) notify.error("Teste não agendado", result.error);
      else notify.success("Teste agendado", "Se você permitiu avisos administrativos, deverá aparecer no aparelho após o próximo ciclo de envio.");
    } catch {
      notify.error("Teste não agendado", "Não foi possível agendar o teste.");
    } finally {
      setWorking(false);
    }
  }

  async function deactivate(): Promise<void> {
    if (!profile || working) return;
    setWorking(true);
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
      notify.success("Dispositivo desativado", "Este dispositivo foi desativado para notificações.");
    } catch (error) {
      notify.error("Não foi possível desativar", error instanceof Error ? error.message : "Não foi possível desativar este dispositivo.");
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
      {setup === "active" ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="form-action-primary" disabled={working} onClick={() => void sendTest()}>
            {working ? "Aguarde..." : "Enviar teste ao meu dispositivo"}
          </button>
          <button type="button" disabled={working} onClick={() => void deactivate()}>
            Desativar notificações neste dispositivo
          </button>
        </div>
      ) : null}
    </section>
  );
}
