import "server-only";
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
export type PushSendResult = { ok: boolean; status: number; expired: boolean };

function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
  return createHmac("sha256", salt).update(ikm).digest();
}
function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  let output = Buffer.alloc(0);
  let prior = Buffer.alloc(0);
  let counter = 1;
  while (output.length < length) {
    prior = createHmac("sha256", prk)
      .update(Buffer.concat([prior, info, Buffer.from([counter++])]))
      .digest();
    output = Buffer.concat([output, prior]);
  }
  return output.subarray(0, length);
}
function validatePushEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  const host = url.hostname.toLowerCase();
  // Push endpoints are only ever delivered to known push services. Prevent
  // SSRF or unwanted arbitrary outbound requests from stored subscriptions.
  const trusted =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com");
  if (!trusted || url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) {
    throw new Error("Provedor Web Push não autorizado");
  }
  return url;
}
function encryptPayload(message: Buffer, uaPublic: Buffer, authSecret: Buffer): Buffer {
  if (message.length > 3072 || uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16) {
    throw new Error("Assinatura ou mensagem Web Push inválida");
  }
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey(undefined, "uncompressed");
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, serverPublic]);
  const ikm = hkdfExpand(hkdfExtract(authSecret, sharedSecret), info, 32);
  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([message, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, encrypted]);
}
function makeVapidToken(audience: string, publicKey: string, privateKey: string): string {
  const publicBytes = Buffer.from(publicKey, "base64url");
  const privateBytes = Buffer.from(privateKey, "base64url");
  if (publicBytes.length !== 65 || privateBytes.length !== 32) throw new Error("VAPID inválido");
  const jwk = {
    kty: "EC" as const,
    crv: "P-256" as const,
    x: publicBytes.subarray(1, 33).toString("base64url"),
    y: publicBytes.subarray(33, 65).toString("base64url"),
    d: privateBytes.toString("base64url"),
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
    sub: process.env.PUSH_VAPID_SUBJECT || "https://jornalir.vercel.app",
  })).toString("base64url");
  const unsigned = header + "." + payload;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return unsigned + "." + signature.toString("base64url");
}
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: { title: string; body: string; kind: string; href: string; tag: string },
): Promise<PushSendResult> {
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Web Push ainda não configurado");
  const endpoint = validatePushEndpoint(subscription.endpoint);
  const uaPublic = Buffer.from(subscription.keys.p256dh, "base64url");
  const authSecret = Buffer.from(subscription.keys.auth, "base64url");
  const body = encryptPayload(Buffer.from(JSON.stringify(payload), "utf8"), uaPublic, authSecret);
  const jwt = makeVapidToken(endpoint.origin, publicKey, privateKey);
  const response = await fetch(endpoint.href, {
    method: "POST",
    headers: {
      "Authorization": "vapid t=" + jwt + ", k=" + publicKey,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "3600",
      "Urgency": payload.kind === "urgent" || payload.kind === "agenda" ? "high" : "normal",
    },
    body: Uint8Array.from(body).buffer,
    signal: AbortSignal.timeout(10000),
  });
  return { ok: response.status === 201 || response.status === 202, status: response.status, expired: response.status === 404 || response.status === 410 };
}
