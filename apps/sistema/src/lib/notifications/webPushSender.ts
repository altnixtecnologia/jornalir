import "server-only";
import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from "node:crypto";

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};
type PushMessage = {
  kind: "news" | "urgent" | "agenda" | "system";
  title: string;
  body: string;
  href: string;
  tag: string;
};
export type PushSendResult =
  | { status: "sent"; httpStatus: number }
  | { status: "gone"; httpStatus: number }
  | { status: "failed"; httpStatus: number }
  | { status: "uncertain"; message: string };

function hkdf(ikm: Buffer, salt: Buffer, info: string | Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(info), length));
}

function normalizeEndpoint(value: string): URL {
  const endpoint = new URL(value);
  const host = endpoint.hostname.toLowerCase();
  const allowed = host === "fcm.googleapis.com"
    || host === "updates.push.services.mozilla.com"
    || host === "web.push.apple.com"
    || host === "webpush.push.apple.com"
    || host === "wns.notify.windows.com"
    || (host.endsWith(".notify.windows.com") && host.length > ".notify.windows.com".length);
  if (!allowed || endpoint.protocol !== "https:" || (endpoint.port && endpoint.port !== "443")) {
    throw new Error("Provedor push não autorizado");
  }
  return endpoint;
}

function vapidToken(endpoint: URL, publicKey: string, privateKey: string, subject: string): string {
  const publicBytes = Buffer.from(publicKey, "base64url");
  const privateBytes = Buffer.from(privateKey, "base64url");
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Credenciais VAPID inválidas");
  }
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new Error("Contato VAPID não configurado");
  }
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC", crv: "P-256",
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
      d: privateBytes.toString("base64url"),
    },
  });
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    aud: endpoint.origin, exp: Math.floor(Date.now() / 1000) + 3600, sub: subject,
  })).toString("base64url");
  const data = header + "." + claims;
  const signature = sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" });
  return data + "." + signature.toString("base64url");
}

function encryptPayload(subscription: PushSubscriptionRow, message: string): Buffer {
  const receiverPublic = Buffer.from(subscription.p256dh, "base64url");
  const receiverAuth = Buffer.from(subscription.auth_secret, "base64url");
  if (receiverPublic.length !== 65 || receiverPublic[0] !== 4 || receiverAuth.length !== 16) {
    throw new Error("Chaves do dispositivo inválidas");
  }
  const sender = createECDH("prime256v1");
  sender.generateKeys();
  const senderPublic = sender.getPublicKey(undefined, "uncompressed");
  const sharedSecret = sender.computeSecret(receiverPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiverPublic, senderPublic]);
  const ikm = hkdf(sharedSecret, receiverAuth, keyInfo, 32);
  const salt = randomBytes(16);
  const cek = hkdf(ikm, salt, "Content-Encoding: aes128gcm\0", 16);
  const nonce = hkdf(ikm, salt, "Content-Encoding: nonce\0", 12);
  const plaintext = Buffer.concat([Buffer.from(message, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  const payload = Buffer.concat([salt, recordSize, Buffer.from([65]), senderPublic, ciphertext]);
  if (payload.length > 4096) throw new Error("Mensagem push muito longa");
  return payload;
}

export function isWebPushConfigured(): boolean {
  return Boolean(process.env.PUSH_VAPID_PUBLIC_KEY
    && process.env.PUSH_VAPID_PRIVATE_KEY
    && process.env.PUSH_VAPID_SUBJECT);
}

/** Returns uncertain for a transport failure: do not retry it automatically
 * because the push provider may have accepted the message already. */
export async function sendWebPush(
  subscription: PushSubscriptionRow,
  payload: PushMessage,
): Promise<PushSendResult> {
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.PUSH_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID não configurado");
  const endpoint = normalizeEndpoint(subscription.endpoint);
  const notification = JSON.stringify({
    kind: payload.kind,
    title: payload.title.slice(0, 140),
    body: payload.body.slice(0, 400),
    href: payload.href,
    tag: payload.tag,
  });
  const body = encryptPayload(subscription, notification);
  const jwt = vapidToken(endpoint, publicKey, privateKey, subject);
  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        Authorization: "vapid t=" + jwt + ", k=" + publicKey,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: payload.kind === "agenda" ? "600" : "86400",
        Urgency: payload.kind === "urgent" || payload.kind === "agenda" ? "high" : "normal",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(6500),
    });
  } catch {
    return { status: "uncertain", message: "Transport response unavailable" };
  }
  if (response.ok) return { status: "sent", httpStatus: response.status };
  if (response.status === 404 || response.status === 410) return { status: "gone", httpStatus: response.status };
  return { status: "failed", httpStatus: response.status };
}
