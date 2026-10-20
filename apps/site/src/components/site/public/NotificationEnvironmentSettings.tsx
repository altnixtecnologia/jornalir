"use client";

import { useEffect, useState } from "react";
import { SitePushPreferences } from "./SitePushPreferences";

type Environment = "checking" | "native" | "bridge-missing" | "webview" | "shortcut" | "browser";

/** O site vive dentro do APK por server.url. A detecção tem que ocorrer
 * no cliente: usar Web Push dentro do WebView do APK dá o erro "navegador
 * não suporta" mesmo quando o FCM nativo está disponível.
 *
 * As opções FCM são renderizadas pelo NativePushPreferences global através
 * do portal #native-push-settings-panel, que mantém listeners vivos em
 * qualquer página. O navegador comum usa SitePushPreferences.
 */
export function NotificationEnvironmentSettings(): JSX.Element {
  const [environment, setEnvironment] = useState<Environment>("checking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let kind: Environment = "browser";
      try {
        const { Capacitor } = await import("@capacitor/core");
        const bridge = (window as Window & {
          Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
        }).Capacitor;
        const native = Capacitor.isNativePlatform() ||
          bridge?.isNativePlatform?.() === true ||
          bridge?.getPlatform?.() === "android";
        if (native) {
          kind = Capacitor.isPluginAvailable("PushNotifications") ? "native" : "bridge-missing";
        } else {
          const ua = navigator.userAgent;
          // Android WebView sem ponte Capacitor: não oferecer Web Push.
          // Isso identifica o problema ao invés de acusar o "navegador".
          const androidWebView = /android/i.test(ua) &&
            (/;\s*wv[);]/i.test(ua) || /Version\/4\.0.*Chrome\//i.test(ua));
          const shortcut = /android/i.test(ua) &&
            window.matchMedia?.("(display-mode: standalone)").matches;
          kind = androidWebView ? "webview" : shortcut ? "shortcut" : "browser";
        }
      } catch {
        // Navegador sem Capacitor: Web Push ainda pode funcionar;
        // WebView identificável não deve mostrar o formulário errado.
        const ua = navigator.userAgent;
        kind = /android/i.test(ua) && /;\s*wv[);]/i.test(ua)
          ? "webview" : "browser";
      }
      if (!cancelled) setEnvironment(kind);
    })();
    return () => { cancelled = true; };
  }, []);

  if (environment === "checking") {
    return <p className="my-6 text-sm" role="status">Verificando o tipo de aplicativo e as notificações disponíveis...</p>;
  }

  if (environment === "native") {
    // O controlador FCM permanece único, montado em layout.tsx.
    // O JSX do painel é inserido aqui pelo portal, nunca duplicado.
    return <div id="native-push-settings-panel" />;
  }

  if (environment === "webview" || environment === "bridge-missing") {
    return (
      <section className="my-6 rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--site-line)" }}>
        <h2 className="text-xl font-bold">Notificações do aplicativo Android</h2>
        <p className="mt-3">
          Não foi possível reconhecer a integração nativa deste aplicativo.
          Por isso, não é seguro mostrar as permissões do navegador como se
          fossem as notificações do Jornal IR.
        </p>
        <p className="mt-3">
          Feche e abra pelo ícone do aplicativo Jornal IR. Se continuar, informe
          o modelo do celular e a versão instalada para verificarmos a ponte Android/Capacitor.
        </p>
      </section>
    );
  }

  if (environment === "shortcut") {
    return (
      <section className="my-6 rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--site-line)" }}>
        <h2 className="text-xl font-bold">Você abriu o atalho do site</h2>
        <p className="mt-3">
          Esse atalho não equivale ao aplicativo Android do Jornal IR. Para
          notificações nativas e canal urgente, abra o APK oficial instalado.
        </p>
        <p className="mt-3">
          <a className="font-semibold underline"
             href="https://pub-3d61ff8f7b474fcdbaa936f006ba2bf4.r2.dev/apps/jornal-ir-v.00.02.apk">
            Baixar o aplicativo Android Jornal IR
          </a>
        </p>
      </section>
    );
  }

  return <SitePushPreferences />;
}
