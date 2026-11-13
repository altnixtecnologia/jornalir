import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica webhook Resend/Svix pelo corpo ORIGINAL e janela de 5 minutos. */
export function verifyResendWebhook(input: {
  rawBody: string; messageId: string|null; timestamp: string|null;
  signatures: string|null; secret: string|undefined;
  nowSeconds?: number;
}): boolean {
  if (!input.secret?.startsWith("whsec_") || !input.messageId || !input.timestamp || !input.signatures) return false;
  if (!/^\d{10}$/.test(input.timestamp) || !/^[A-Za-z0-9_\-]{3,160}$/.test(input.messageId)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now()/1000);
  if (Math.abs(now - Number(input.timestamp)) > 300) return false;
  let key: Buffer;
  try { key = Buffer.from(input.secret.slice(6),"base64"); } catch { return false; }
  if (!key.length) return false;
  const expected = createHmac("sha256",key)
    .update(`${input.messageId}.${input.timestamp}.${input.rawBody}`).digest();
  for (const candidate of input.signatures.split(/\s+/)) {
    if (!candidate.startsWith("v1,")) continue;
    const presented = Buffer.from(candidate.slice(3),"base64");
    if (presented.length === expected.length && timingSafeEqual(presented,expected)) return true;
  }
  return false;
}
