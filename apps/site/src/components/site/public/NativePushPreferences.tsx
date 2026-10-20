"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";

// Preferências de push NATIVO (FCM via Capacitor), só dentro do app
// Android instalado — nunca aparece/ativa no site aberto num navegador
// comum (Capacitor.isNativePlatform() é false ali). Componente separado
// de SitePushPreferences.tsx (Web Push do navegador): são dois
// mecanismos de entrega diferentes para o mesmo leitor; aqui nunca se
// inscreve em Web Push, lá nunca se inscreve em FCM — evita qualquer
// disputa entre os dois nesta tela.
//
// Contrato real do backend (branch feature/backend-fcm-notificacoes-20261019,
// doc docs/JORNAL-IR-BACKEND-FCM-INTEGRACAO-20261019.md) — alinhado aqui
// 19/10/2026. POST/DELETE em /api/public/push/fcm (alias de
// /api/public/native-push, mesmo contrato). Identidade do aparelho = par
// installationId (UUID) + managementToken (segredo local aleatório),
// gerados e preservados no primeiro uso — nunca enviados na URL, nunca
// logados. fcmToken é só o token do SDK Firebase, pode mudar; o backend
// correlaciona pelo par acima, não pelo token.

const INSTALLATION_ID_KEY = "jornalir_native_push_installation_id";
const MANAGEMENT_TOKEN_KEY = "jornalir_native_push_management_token";
const SUBSCRIBED_KEY = "jornalir_native_push_subscribed";
const WELCOME_CHOICE_KEY = "jornalir_native_push_welcome_choice_v1";
const PREFERENCES_KEY = "jornalir_native_push_preferences_v1";
const CHANNEL_NORMAL = "jornal_ir_normal_v1";
const CHANNEL_URGENT = "jornal_ir_urgente_v1";
const FCM_ENDPOINT = "https://controle.altnix.com.br/api/public/push/fcm";

type Status = "checking" | "unavailable" | "preparing" | "ready" | "active" | "blocked";

interface PushNotificationSchema {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

function getOrCreateIdentity(): { installationId: string; managementToken: string } | null {
  try {
    let installationId = localStorage.getItem(INSTALLATION_ID_KEY);
    if (!installationId) {
      installationId = crypto.randomUUID();
      localStorage.setItem(INSTALLATION_ID_KEY, installationId);
    }
    let managementToken = localStorage.getItem(MANAGEMENT_TOKEN_KEY);
    if (!managementToken) {
      managementToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(MANAGEMENT_TOKEN_KEY, managementToken);
    }
    return { installationId, managementToken };
  } catch {
    return null;
  }
}

/** event_id vira um id numérico estável de notificação local — além de
 * identificar, isso deduplica: agendar duas vezes com o mesmo id
 * substitui em vez de mostrar duas notificações (19/10/2026). */
function stableLocalId(eventId: string | undefined): number {
  if (!eventId) return Date.now() % 2147483647;
  let hash = 0;
  for (let i = 0; i < eventId.length; i += 1) hash = (hash * 31 + eventId.charCodeAt(i)) % 2147483647;
  return Math.abs(hash) || 1;
}

export function NativePushPreferences(): JSX.Element | null {
  const [isNative, setIsNative] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [ordinary, setOrdinary] = useState(true);
  const [urgent, setUrgent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [listenersReady, setListenersReady] = useState(false);
  const prefsRef = useRef({ ordinary: true, urgent: true });
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        if (cancelled) return;
        setIsNative(true);
        // Manter escolhas anteriores, inclusive se o usuário desativou um
        // dos canais. O SDK pode renovar o token a qualquer momento.
        try {
          const savedPrefs = localStorage.getItem(PREFERENCES_KEY);
          if (savedPrefs) {
            const parsed: unknown = JSON.parse(savedPrefs);
            if (parsed && typeof parsed === "object" &&
                "ordinary" in parsed && "urgent" in parsed &&
                typeof parsed.ordinary === "boolean" && typeof parsed.urgent === "boolean") {
              prefsRef.current = { ordinary: parsed.ordinary, urgent: parsed.urgent };
              setOrdinary(parsed.ordinary);
              setUrgent(parsed.urgent);
            }
          }
        } catch {
          // Em armazenamento restrito, preferências padrão; não bloquear o app.
        }

        // Status público: enquanto o backend não liberar o cadastro
        // (registrationAvailable=false), não oferecemos "Ativar" — evita
        // prometer uma inscrição que o servidor ainda recusaria.
        let registrationAvailable = false;
        try {
          const statusResponse = await fetch(FCM_ENDPOINT, { method: "GET", cache: "no-store" });
          if (statusResponse.ok) {
            const body = (await statusResponse.json()) as { registrationAvailable?: boolean };
            registrationAvailable = body.registrationAvailable === true;
          }
        } catch {
          registrationAvailable = false;
        }
        if (cancelled) return;
        if (!registrationAvailable) {
          setStatus("preparing");
          return;
        }

        const { PushNotifications } = await import("@capacitor/push-notifications");
        const permission = await PushNotifications.checkPermissions();
        if (cancelled) return;
        const alreadySubscribed = (() => {
          try {
            return localStorage.getItem(SUBSCRIBED_KEY) === "1";
          } catch {
            return false;
          }
        })();
        if (permission.receive === "granted") {
          setStatus(alreadySubscribed ? "active" : "ready");
        } else if (permission.receive === "denied") {
          setStatus("blocked");
        } else {
          setStatus("ready");
        }

        // Apenas no app nativo, primeira abertura e após confirmação de
        // disponibilidade do servidor. Nunca chamar requestPermissions()
        // daqui: o diálogo oficial só aparece após toque em "Ativar".
        if (!alreadySubscribed && permission.receive !== "denied") {
          try {
            if (!localStorage.getItem(WELCOME_CHOICE_KEY)) setShowWelcome(true);
          } catch {
            // Sem persistência, não arriscar oferecer a mesma tela sempre.
          }
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
    let cancelled = false;

    void (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      registrationHandle = await PushNotifications.addListener("registration", (token) => {
        void registerWithBackend(token.value, prefsRef.current);
      });

      errorHandle = await PushNotifications.addListener("registrationError", () => {
        setMessage("Não foi possível registrar este aparelho para notificações.");
      });

      // App aberto (foreground): o Android NÃO mostra a notificação FCM
      // sozinho — precisa ser exibida manualmente com local-notifications,
      // no mesmo canal (som/vibração) que o envio em segundo plano usaria.
      // Nunca toca áudio via Web Audio em paralelo — só o canal nativo.
      receivedHandle = await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification: PushNotificationSchema) => {
          const kind = notification.data?.kind === "urgent" ? "urgent" : "ordinary";
          void LocalNotifications.schedule({
            notifications: [
              {
                id: stableLocalId(notification.data?.event_id),
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
      // matéria direto em /noticias/<slug>, mesmo campo data.href que o
      // backend envia.
      actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const href = action.notification.data?.href;
        if (typeof href === "string" && /^\/noticias\/[a-z0-9-]+\/?$/i.test(href)) router.push(href);
      });
      if (!cancelled) setListenersReady(true);
    })().catch(() => {
      if (!cancelled) {
        setListenersReady(false);
        setMessage("Não foi possível iniciar o serviço nativo de notificações.");
      }
    });

    return () => {
      cancelled = true;
      setListenersReady(false);
      registrationHandle?.remove();
      actionHandle?.remove();
      receivedHandle?.remove();
      errorHandle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  async function registerWithBackend(fcmToken: string, prefs: { ordinary: boolean; urgent: boolean }): Promise<void> {
    const identity = getOrCreateIdentity();
    if (!identity) {
      setMessage("Não foi possível preparar a identidade local deste aparelho.");
      return;
    }
    try {
      const response = await fetch(FCM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "android",
          installationId: identity.installationId,
          managementToken: identity.managementToken,
          fcmToken,
          ordinary: prefs.ordinary,
          urgent: prefs.urgent,
          consented: true,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Cadastro recusado pelo servidor.");
      try {
        localStorage.setItem(SUBSCRIBED_KEY, "1");
      } catch {
        // Sem localStorage: a inscrição no servidor é válida mesmo assim,
        // só não é lembrada entre aberturas do app.
      }
      setStatus("active");
      setMessage(null);
    } catch (error) {
      // Backend pode ainda estar em homologação (503) ou indisponível —
      // nunca finge "ativo" sem confirmação real do servidor.
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir o cadastro no servidor.");
    }
  }

  async function activate(): Promise<void> {
    if (busy) return;
    if (!listenersReady) { setMessage("Aguarde a preparação das notificações."); return; }
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
      // O token FCM chega pelo listener "registration" (acima), que
      // completa o POST ao backend com consented:true.
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
      const identity = getOrCreateIdentity();
      if (identity) {
        try {
          await fetch(FCM_ENDPOINT, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installationId: identity.installationId, managementToken: identity.managementToken }),
          });
        } catch {
          // Backend indisponível: segue desativando localmente mesmo assim.
        }
      }
      try {
        localStorage.removeItem(SUBSCRIBED_KEY);
      } catch {
        // Ignorado.
      }
      setStatus("ready");
      setMessage("Notificações do aplicativo desativadas neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePreferences(nextOrdinary: boolean, nextUrgent: boolean): Promise<void> {
    prefsRef.current = { ordinary: nextOrdinary, urgent: nextUrgent };
    setOrdinary(nextOrdinary);
    setUrgent(nextUrgent);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefsRef.current));
    } catch { /* Armazenamento opcional; o servidor continua sendo a referência. */ }
    if (status !== "active") return;
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const current = await PushNotifications.checkPermissions();
      if (current.receive !== "granted") return;
      // Reenvia o token atual já conhecido pelo SDK (não re-registra do
      // zero) — o backend trata um novo POST do mesmo par
      // instalação/segredo como atualização de preferências.
      await PushNotifications.register();
    } catch {
      // Tratado via listener "registration"/"registrationError".
    }
  }

  function dismissWelcome(choice: "accepted" | "declined"): void {
    try { localStorage.setItem(WELCOME_CHOICE_KEY, choice); }
    catch { /* Não exibir a caixa novamente nesta sessão. */ }
    setShowWelcome(false);
    if (choice === "accepted") void activate();
  }

  if (!isNative) return null;

  return (
    <>
      {showWelcome && status === "ready" ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 px-4 py-6"
          role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="push-welcome-title"
            aria-describedby="push-welcome-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            style={{ color: "var(--brand-navy)" }}>
            <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--site-muted)" }}>
              Jornal IR
            </p>
            <h2 id="push-welcome-title" className="mt-2 text-2xl font-bold">
              Receba notícias no seu celular
            </h2>
            <p id="push-welcome-description" className="mt-3 text-base leading-relaxed">
              Ative os avisos de novas matérias e notícias urgentes do Jornal IR.
              Você poderá escolher os tipos de alerta ou desativá-los depois.
            </p>
            <div className="mt-6 grid gap-3">
              <button type="button" disabled={busy || !listenersReady}
                onClick={() => dismissWelcome("accepted")}
                className="rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60"
                style={{ background: "var(--brand-navy)" }}>
                {listenersReady ? "Ativar notificações" : "Preparando notificações..."}
              </button>
              <button type="button" onClick={() => dismissWelcome("declined")}
                className="rounded-xl border px-4 py-3 font-semibold"
                style={{ borderColor: "var(--site-line)" }}>
                Agora não
              </button>
            </div>
            <p className="mt-4 text-center text-xs" style={{ color: "var(--site-muted)" }}>
              Só solicitaremos a permissão do Android se você tocar em Ativar.
            </p>
          </section>
        </div>
      ) : null}
      {pathname === "/notificacoes" &&
       typeof document !== "undefined" &&
       document.getElementById("native-push-settings-panel")
        ? createPortal(
    <section className="mx-auto my-6 max-w-2xl rounded-xl border bg-white p-5 shadow-sm sm:p-7" style={{ borderColor: "var(--site-line)" }}>
      <h2 className="text-xl font-bold">Notificações do aplicativo</h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
        Notificações nativas do Android (som e vibração próprios, mesmo com o app fechado). Independente das
        notificações do navegador.
      </p>
      <div className="my-5 grid gap-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={ordinary} onChange={(e) => void updatePreferences(e.target.checked, urgent)} className="mt-1 h-5 w-5" disabled={busy || status === "preparing"} />
          <span><strong>Notícias do dia</strong><small className="mt-1 block">Avisos de novas notícias e destaques.</small></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={urgent} onChange={(e) => void updatePreferences(ordinary, e.target.checked)} className="mt-1 h-5 w-5" disabled={busy || status === "preparing"} />
          <span><strong>Notícias urgentes</strong><small className="mt-1 block">Alertas importantes, com som e vibração próprios.</small></span>
        </label>
      </div>
      {status === "checking" ? <p className="text-sm">Verificando...</p> : null}
      {status === "unavailable" ? <p className="text-sm">Serviço de notificações indisponível neste momento.</p> : null}
      {status === "preparing" ? <p className="text-sm">Notificações do aplicativo ainda em preparação — volte em breve.</p> : null}
      {status === "blocked" ? <p className="text-sm">Notificações bloqueadas nas configurações do Android para este app.</p> : null}
      {status === "ready" ? (
        <button type="button" disabled={busy || !listenersReady} onClick={() => { dismissWelcome("accepted"); }} className="rounded-lg bg-[#30305c] px-5 py-3 font-semibold text-white">
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
    </section>,
        document.getElementById("native-push-settings-panel")!,
      ) : null}
    </>
  );
}
