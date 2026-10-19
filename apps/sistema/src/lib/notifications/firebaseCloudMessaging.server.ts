import "server-only";
import { createSign } from "node:crypto";

const OAUTH_ENDPOINT = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let cachedToken: { token: string; expiresAt: number } | null = null;

export type FcmSendResult = {
  ok: boolean;
  status: number;
  expired: boolean;
  messageId?: string;
  errorCode?: string;
};

function credentials(): { projectId: string; email: string; privateKey: string } {
  const projectId = process.env.FIREBASE_PROJECT_ID || "";
  const email = process.env.FIREBASE_CLIENT_EMAIL || "";
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!/^[a-z][a-z0-9-]{4,60}$/.test(projectId) || !email.endsWith(".gserviceaccount.com") ||
      !privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("Firebase FCM não configurado no servidor.");
  }
  return { projectId, email, privateKey };
}

export function isNativeFcmConfigured(): boolean {
  try { credentials(); return true; } catch { return false; }
}

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 120_000) return cachedToken.token;
  const { email, privateKey } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: email, scope: FCM_SCOPE, aud: OAUTH_ENDPOINT, iat: now, exp: now + 3600,
  })).toString("base64url");
  const unsigned = header + "." + claims;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signed = unsigned + "." + signer.sign(privateKey).toString("base64url");
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: signed,
  });
  const response = await fetch(OAUTH_ENDPOINT, {
    method: "POST", body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Falha na autenticação do Firebase (" + response.status + ").");
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token || !result.expires_in) throw new Error("Resposta de autenticação FCM incompleta.");
  cachedToken = { token: result.access_token, expiresAt: Date.now() + Math.min(3600, result.expires_in) * 1000 };
  return result.access_token;
}

/** Enviar a um único token FCM (nunca logar o token ou a credencial).
 * Os sons são definidos pelos canais Android criados no APK, não pelo servidor.
 */
export async function sendFcmToAndroid(input: {
  token: string; eventId: string; kind: "ordinary" | "urgent";
  title: string; body: string; href: string;
}): Promise<FcmSendResult> {
  const { projectId } = credentials();
  if (process.env.NATIVE_FCM_DELIVERY_ENABLED !== "true") {
    throw new Error("Envios FCM desativados até homologação.");
  }
  if (!/^[a-zA-Z0-9:_-]{40,4096}$/.test(input.token)) {
    throw new Error("Token FCM inválido.");
  }
  if (!/^\/noticias\/[a-z0-9-]+\/?$/i.test(input.href)) {
    throw new Error("Link de matéria inválido.");
  }
  const urgent = input.kind === "urgent";
  const response = await fetch(
    "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/messages:send",
    {
      method: "POST",
      cache: "no-store",
      headers: { authorization: "Bearer " + await accessToken(), "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: input.token,
          notification: { title: input.title.slice(0, 110), body: input.body.slice(0, 320) },
          android: {
            priority: urgent ? "HIGH" : "NORMAL",
            ttl: "3600s",
            collapse_key: input.eventId,
            notification: {
              channel_id: urgent ? "jornal_ir_urgente_v1" : "jornal_ir_normal_v1",
              notification_priority: urgent ? "PRIORITY_HIGH" : "PRIORITY_DEFAULT",
              default_vibrate_timings: urgent,
              tag: input.eventId,
            },
          },
          data: { href: input.href, kind: input.kind, event_id: input.eventId },
        },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const raw = await response.json().catch(() => ({})) as {
    name?: string;
    error?: { status?: string; details?: Array<{ errorCode?: string }> };
  };
  const code = raw.error?.details?.find((detail) => detail.errorCode)?.errorCode || raw.error?.status;
  const expired = code === "UNREGISTERED" || response.status === 404;
  return {
    ok: response.ok && Boolean(raw.name),
    status: response.status,
    expired,
    messageId: response.ok ? raw.name : undefined,
    errorCode: response.ok ? undefined : String(code || "FCM_HTTP_" + response.status).slice(0, 70),
  };
}
