import "server-only";
import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from "node:crypto";

export type MobilePushKeys = { endpoint: string; p256dh: string; auth_secret: string };
export type MobilePushPayload = {
  title: string;
  body: string;
  href: string;
  kind: "news" | "urgent" | "agenda" | "system";
  eventKey: string;
};

const SITE_ORIGIN = "https://jornalir.vercel.app";

const base64url = (value: Buffer): string => value.toString("base64url");

export function validatePushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    const h = url.hostname.toLowerCase();
    // Avoid arbitrary internal fetches and SSRF via untrusted subscription URLs.
    return h === "fcm.googleapis.com" ||
      h === "updates.push.services.mozilla.com" ||
      h === "web.push.apple.com" ||
      (h.endsWith(".notify.windows.com") && h.length < 100);
  } catch {
    return false;
  }
}

export function validSubscription(value: MobilePushKeys): boolean {
  if (!value || typeof value.endpoint !== "string" || !validatePushEndpoint(value.endpoint)) return false;
  if (typeof value.p256dh !== "string" || typeof value.auth_secret !== "string") return false;
  try {
    const publicKey = Buffer.from(value.p256dh, "base64url");
    const secret = Buffer.from(value.auth_secret, "base64url");
    return publicKey.length === 65 && publicKey[0] === 4 &&
      secret.length >= 16 && secret.length <= 32 && value.endpoint.length <= 2048;
  } catch {
    return false;
  }
}

export function vapidPublicKey(): string | null {
  const pub = process.env.PUSH_VAPID_PUBLIC_KEY;
  const priv = process.env.PUSH_VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  try {
    const key = Buffer.from(pub, "base64url");
    const secret = Buffer.from(priv, "base64url");
    if (key.length !== 65 || key[0] !== 4 || secret.length !== 32) return null;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(secret);
    if (!ecdh.getPublicKey().equals(key)) return null;
    return pub;
  } catch {
    return null;
  }
}

function bearerToken(audience: string, pub: string, priv: string): string {
  const key = Buffer.from(pub, "base64url");
  const jwk = {
    kty: "EC" as const,
    crv: "P-256" as const,
    x: base64url(key.subarray(1, 33)),
    y: base64url(key.subarray(33, 65)),
    d: priv,
  };
  const head = base64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 55 * 60,
    sub: process.env.PUSH_VAPID_SUBJECT || SITE_ORIGIN,
  })));
  const signing = head + "." + payload;
  const signature = sign("sha256", Buffer.from(signing), {
    key: createPrivateKey({ key: jwk, format: "jwk" }),
    dsaEncoding: "ieee-p1363",
  });
  return signing + "." + base64url(signature);
}

function encryptForBrowser(keys: MobilePushKeys, payload: string): Buffer {
  // RFC8291 + RFC8188: aes128gcm and the 16-byte auth secret from PushSubscription.
  const peerPublic = Buffer.from(keys.p256dh, "base64url");
  const authSecret = Buffer.from(keys.auth_secret, "base64url");
  const ephemeral = createECDH("prime256v1");
  const senderPublic = ephemeral.generateKeys();
  const shared = ephemeral.computeSecret(peerPublic);
  const context = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"), peerPublic, senderPublic,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, context, 32));
  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const plain = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([senderPublic.length]), senderPublic, ciphertext]);
}

export async function sendMobileWebPush(
  keys: MobilePushKeys, payload: MobilePushPayload,
): Promise<{ ok: boolean; status: number; reason: string }> {
  const publicKey = vapidPublicKey();
  if (!publicKey || !process.env.PUSH_VAPID_PRIVATE_KEY) {
    return { ok: false, status: 503, reason: "Chaves VAPID não configuradas." };
  }
  if (!validSubscription(keys)) return { ok: false, status: 400, reason: "Assinatura inválida." };
  if (!payload.href.startsWith("/") || payload.href.startsWith("//")) {
    return { ok: false, status: 400, reason: "Link não permitido." };
  }
  const token = bearerToken(new URL(keys.endpoint).origin, publicKey, process.env.PUSH_VAPID_PRIVATE_KEY);
  const body = encryptForBrowser(keys, JSON.stringify({
    title: payload.title.slice(0, 140),
    body: payload.body.slice(0, 300),
    href: payload.href,
    kind: payload.kind,
    eventKey: payload.eventKey,
  }));
  try {
    const response = await fetch(keys.endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": payload.kind === "urgent" ? "3600" : "86400",
        "Urgency": payload.kind === "urgent" ? "high" : "normal",
        "Authorization": "vapid t=" + token + ", k=" + publicKey,
      },
      body: new Uint8Array(body),
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    return { ok: response.status === 201 || response.status === 202, status: response.status,
      reason: "HTTP " + response.status };
  } catch (error) {
    return { ok: false, status: 0, reason: error instanceof Error ? error.message.slice(0, 240) : "Erro de rede" };
  }
}

export function allowedPushSiteOrigin(origin: string): boolean {
  const allowed = (process.env.PUSH_ALLOWED_SITE_ORIGINS ?? SITE_ORIGIN)
    .split(",").map((entry) => entry.trim()).filter(Boolean);
  return allowed.includes(origin);
}
