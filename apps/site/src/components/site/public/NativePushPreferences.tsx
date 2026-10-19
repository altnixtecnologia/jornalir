"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Preferências de push NATIVO (FCM via Capacitor), só dentro do app
// Android instalado — nunca aparece/ativa no site aberto num navegador
// comum (Capacitor.isNativePlatform() é false ali). Componente separado
// de SitePushPreferences.tsx (Web Push do navegador): são dois
// mecanismos de entrega diferentes para o mesmo leitor; aqui nunca se
// inscreve em Web Push, lá nunca se inscreve em FCM — evita qualquer
// disputa entre os dois nesta tela (19/10/2026).
//
// Backend ainda NÃO implementado (branch separada
// feature/backend-fcm-notificacoes-20261019) — ver contrato documentado
// em docs/JORNAL-IR-PUSH-NATIVO-ANDROID-V0002-20261019.md. Até lá, o
// registro no servidor falha de forma tratada (sem travar a UI) e nenhum
// dado falso de "ativo" é mostrado.

const TOKEN_KEY = "jornalir_fcm_token";
const CHANNEL_NORMAL = "jornal_ir_normal_v1";
const CHANNEL_URGENT = "jornal_ir_urgente_v1";
const FCM_ENDPOINT = process.env.NEXT_PUBLIC_NOTIFICATIONS_GATEWAY_URL
  ? process.env.NEXT_PUBLIC_NOTIFICATIONS_GATEWAY_URL.replace(/\/[^/]*$/, "/push/fcm")
  : "https://controle.altnix.com.br/api/public/push/fcm";

type Status = "checking" | "unavailable" | "ready" | "active" | "blocked";

interface PushNotificationSchema {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

export function NativePushPreferences(): JSX.Element | null {
  const [isNative, setIsNative] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [ordinary, setOrdinary] = useState(true);
  const [urgent, setUrgent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        if (cancelled) return;
        setIsNative(true);

        const { PushNotifications } = await import("@capacitor/push-notifications");
        const permission = await PushNotifications.checkPermissions();
        if (cancelled) return;
        if (permission.receive === "granted") {
          setStatus(localStorage.getItem(TOKEN_KEY) ? "active" : "ready");
        } else if (permission.receive === "denied") {
          setStatus("blocked");
        } else {
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listeners nativos — só registrados quando de fato dentro do app
  // (isNative true), nunca no navegador comum.
  useEffect(() => {
    if (!isNative) return;
    let registrationHandle: { remove: () => void } | undefined;
    let actionHandle: { remove: () => void } | undefined;
    let receivedHandle: { remove: () => void } | undefined;
    let errorHandle: { remove: () => void } | undefined;

    void (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      registrationHandle = await PushNotifications.addListener("registration", (token) => {
        try {
          localStorage.setItem(TOKEN_KEY, token.value);
        } catch {
          // Sem localStorage: o token ainda é enviado ao backend nesta
          // sessão, só não persiste entre aberturas do app.
        }
        setStatus("active");
        void registerTokenWithBackend(token.value, { ordinary, urgent });
      });

      errorHandle = await PushNotifications.addListener("registrationError", () => {
        setMessage("Não foi possível registrar este aparelho para notificações.");
      });

      // App aberto (foreground): o Android NÃO mostra a notificação
      // sozinho — precisa ser exibida manualmente com local-notifications,
      // usando o mesmo canal/som do envio (19/10/2026).
      receivedHandle = await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification: PushNotificationSchema) => {
          const kind = notification.data?.kind === "urgent" ? "urgent" : "ordinary";
          void LocalNotifications.schedule({
            notifications: [
              {
                id: Date.now() % 2147483647,
                title: notification.title ?? "Jornal IR",
                body: notification.body ?? "",
                channelId: kind === "urgent" ? CHANNEL_URGENT : CHANNEL_NORMAL,
                extra: notification.data,
              },
            ],
          });
        },
      );

      // Toque na notificação (app em segundo plano ou fechado) — abre a
      // matéria direto, mesmo padrão de href da central web.
      actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const href = action.notification.data?.href;
        if (typeof href === "string" && href.startsWith("/")) router.push(href);
      });
    })();

    return () => {
      registrationHandle?.remove();
      actionHandle?.remove();
      receivedHandle?.remove();
      errorHandle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  async function registerTokenWithBackend(token: string, prefs: { ordinary: boolean; urgent: boolean }): Promise<void> {
    try {
      const response = await fetch(FCM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform: "android", ordinary: prefs.ordinary, urgent: prefs.urgent }),
      });
      if (!response.ok) throw new Error("backend indisponível");
    } catch {
      // Esperado hoje: backend FCM ainda não existe (ver docs). A
      // inscrição nativa continua válida no aparelho; só o registro no
      // servidor fica pendente até o endpoint existir.
      setMessage("Preferência salva neste aparelho. O servidor de notificações ainda está sendo preparado.");
    }
  }

  async function activate(): Promise<void> {
    if (busy) return;
    if (!ordinary && !urgent) {
      setMessage("Escolha ao menos um tipo de aviso.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") {
        setStatus("blocked");
        setMessage("Notificações não autorizadas nas configurações do Android.");
        return;
      }
      await PushNotifications.register();
      // O token chega pelo listener "registration" (acima) e completa o registro.
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
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        await fetch(FCM_ENDPOINT, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(() => {
          // Backend ainda não existe hoje — segue desativando localmente mesmo assim.
        });
      }
      localStorage.removeItem(TOKEN_KEY);
      setStatus("ready");
      setMessage("Notificações do aplicativo desativadas neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePreferences(nextOrdinary: boolean, nextUrgent: boolean): Promise<void> {
    setOrdinary(nextOrdinary);
    setUrgent(nextUrgent);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) await registerTokenWithBackend(token, { ordinary: nextOrdinary, urgent: nextUrgent });
    } catch {
      // Tratado dentro de registerTokenWithBackend.
    }
  }

  if (!isNative) return null;

  return (
    <section className="mx-auto my-6 max-w-2xl rounded-xl border bg-white p-5 shadow-sm sm:p-7" style={{ borderColor: "var(--site-line)" }}>
      <h2 className="text-xl font-bold">Notificações do aplicativo</h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
        Notificações nativas do Android (som e vibração próprios, mesmo com o app fechado). Independente das
        notificações do navegador.
      </p>
      <div className="my-5 grid gap-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={ordinary} onChange={(e) => void updatePreferences(e.target.checked, urgent)} className="mt-1 h-5 w-5" disabled={busy} />
          <span><strong>Notícias do dia</strong><small className="mt-1 block">Avisos de novas notícias e destaques.</small></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={urgent} onChange={(e) => void updatePreferences(ordinary, e.target.checked)} className="mt-1 h-5 w-5" disabled={busy} />
          <span><strong>Notícias urgentes</strong><small className="mt-1 block">Alertas importantes, com som e vibração próprios.</small></span>
        </label>
      </div>
      {status === "checking" ? <p className="text-sm">Verificando...</p> : null}
      {status === "unavailable" ? <p className="text-sm">Serviço de notificações indisponível neste momento.</p> : null}
      {status === "blocked" ? <p className="text-sm">Notificações bloqueadas nas configurações do Android para este app.</p> : null}
      {status === "ready" ? (
        <button type="button" disabled={busy} onClick={() => void activate()} className="rounded-lg bg-[#30305c] px-5 py-3 font-semibold text-white">
          {busy ? "Ativando..." : "Ativar avisos no aplicativo"}
        </button>
      ) : null}
      {status === "active" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold" style={{ color: "var(--brand-navy)" }}>Avisos ativos neste aparelho.</p>
          <button type="button" disabled={busy} onClick={() => void deactivate()} className="rounded-lg border px-4 py-2 text-sm font-semibold">
            Desativar neste aparelho
          </button>
        </div>
      ) : null}
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
