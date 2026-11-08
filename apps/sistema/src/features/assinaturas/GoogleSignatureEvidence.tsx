"use client";

import { useEffect, useRef, useState } from "react";
import {
  confirmGoogleSignatureEvidenceAction, getGoogleSignatureChallengeAction,
} from "../../app/assinatura-google-actions";

type Mode = "commercial" | "institutional";
type GoogleResponse = { credential?: string };
type GoogleApi = {
  initialize: (config: {
    client_id: string; nonce: string; ux_mode: "popup";
    callback: (response: GoogleResponse) => void;
  }) => void;
  renderButton: (element: HTMLElement, options: { type: "standard"; theme: "outline"; size: "large"; text: "continue_with"; locale: "pt-BR" }) => void;
};
type GoogleWindow = Window & { google?: { accounts?: { id?: GoogleApi } } };

const GIS_SCRIPT = "https://accounts.google.com/gsi/client";
async function googleSdk(): Promise<GoogleApi> {
  const existing = (window as GoogleWindow).google?.accounts?.id;
  if (existing) return existing;

  await new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-signature-google="1"]');
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SCRIPT;
      script.async = true;
      script.defer = true;
      script.dataset.signatureGoogle = "1";
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar a autenticação Google.")), { once: true });
    if ((window as GoogleWindow).google?.accounts?.id) resolve();
  });
  const api = (window as GoogleWindow).google?.accounts?.id;
  if (!api) throw new Error("Serviço Google indisponível neste navegador.");
  return api;
}

/**
 * Google é uma evidência ADICIONAL e opcional. Não substitui código de
 * e-mail, declaração de aceite nem o ato de assinar. Não faz login no
 * Supabase e não altera a sessão da pessoa que confirmou o OTP.
 */
export function GoogleSignatureEvidence({
  token, mode, emailVerified,
}: { token: string; mode: Mode; emailVerified: boolean }): JSX.Element | null {
  const container = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"hidden" | "loading" | "ready" | "verified">("hidden");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!emailVerified) { setStatus("hidden"); return; }
    let disposed = false;
    setStatus("loading");
    setMessage("");
    async function start(): Promise<void> {
      const challenge = await getGoogleSignatureChallengeAction({ token, mode });
      if ("error" in challenge) {
        if (!disposed) {
          setStatus("hidden");
          if (!challenge.error.includes("ainda não está configurado")) setMessage(challenge.error);
        }
        return;
      }
      const api = await googleSdk();
      if (disposed || !container.current) return;
      api.initialize({
        client_id: challenge.clientId,
        nonce: challenge.nonce,
        ux_mode: "popup",
        callback: async (response) => {
          if (disposed || !response.credential) return;
          setStatus("loading");
          setMessage("Conferindo a identidade Google…");
          const verified = await confirmGoogleSignatureEvidenceAction({
            token, mode, nonce: challenge.nonce, credential: response.credential,
          });
          if (disposed) return;
          if ("error" in verified) {
            setStatus("ready");
            setMessage(verified.error);
          } else {
            setStatus("verified");
            setMessage("Conta Google " + verified.verifiedEmail + " confirmada e vinculada a este convite.");
          }
        },
      });
      container.current.replaceChildren();
      api.renderButton(container.current, {
        type: "standard", theme: "outline", size: "large",
        text: "continue_with", locale: "pt-BR",
      });
      if (!disposed) setStatus("ready");
    }
    void start().catch((error) => {
      if (!disposed) {
        setStatus("hidden");
        setMessage(error instanceof Error ? error.message : "Google indisponível.");
      }
    });
    return () => { disposed = true; };
  }, [token, mode, emailVerified]);

  if (!emailVerified || (status === "hidden" && !message)) return null;

  return (
    <section style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 12, margin: "12px 0" }}
      aria-label="Comprovação adicional pelo Google">
      <strong>Confirmação Google — opcional</strong>
      <p className="helper-text">
        Você pode confirmar também sua conta Google, como evidência adicional.
        Isso não substitui o código recebido por e-mail nem a assinatura do documento.
        Não solicitamos acesso ao Gmail ou aos seus arquivos.
      </p>
      {status !== "verified" ? <div ref={container} /> : null}
      {status === "loading" && !message ? <p role="status">Preparando autenticação Google…</p> : null}
      {message ? <p role={status === "verified" ? "status" : "alert"}>{message}</p> : null}
    </section>
  );
}
