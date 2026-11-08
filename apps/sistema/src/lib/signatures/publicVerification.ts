import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * QR público de validação de ACEITE (não é link de acesso ao PDF).
 * A identificação é um UUID aleatório do convite + MAC, nunca CPF,
 * e-mail, número do contrato ou um token que permite assinar.
 */
export type VerificationKind = "institutional" | "commercial";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^v1-([ic])-([0-9a-f]{32})-([0-9a-f]{48})$/;

function key(secret: string): string {
  if (secret.length < 32) throw new Error("SIGNATURE_VERIFICATION_SECRET não configurado (mínimo 32 caracteres).");
  return secret;
}

function uuidCompact(id: string): string {
  if (!UUID.test(id)) throw new Error("Convite de verificação inválido.");
  return id.replace(/-/g, "").toLowerCase();
}

export function createVerificationCode(kind: VerificationKind, invitationId: string, secret: string): string {
  const type = kind === "institutional" ? "i" : "c";
  const id = uuidCompact(invitationId);
  const payload = `v1-${type}-${id}`;
  const mac = createHmac("sha256", key(secret)).update(payload).digest("hex").slice(0, 48);
  return `${payload}-${mac}`;
}

export function decodeVerificationCode(code: string, secret: string): { kind: VerificationKind; invitationId: string } | null {
  const match = CODE.exec(code);
  if (!match) return null;
  const payload = `v1-${match[1]}-${match[2]}`;
  const expected = Buffer.from(createHmac("sha256", key(secret)).update(payload).digest("hex").slice(0, 48), "hex");
  const received = Buffer.from(match[3], "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const id = match[2];
  return {
    kind: match[1] === "i" ? "institutional" : "commercial",
    invitationId: `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`,
  };
}

export function getVerificationUrl(kind: VerificationKind, invitationId: string): string | null {
  const secret = process.env.SIGNATURE_VERIFICATION_SECRET;
  const base = process.env.SIGNATURE_VERIFICATION_BASE_URL;
  if (!secret || !base) return null;
  const origin = new URL(base);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("SIGNATURE_VERIFICATION_BASE_URL deve ser um endereço HTTPS sem query.");
  }
  return new URL("/verificar-contrato/" + createVerificationCode(kind, invitationId, secret), origin).toString();
}
