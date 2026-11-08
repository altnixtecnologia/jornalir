import "server-only";
import {
  createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify,
} from "node:crypto";

/**
 * Prova ADICIONAL de uso de conta Google no convite do cliente.
 * A assinatura principal continua exigindo OTP, aceite e PDF imutável.
 * Jamais confundir Google sub com verificação de CPF.
 */
type SignatureMode = "commercial" | "institutional";

interface NonceData {
  kind: SignatureMode;
  invitationHash: string;
  expires: number;
  salt: string;
}
export interface VerifiedGoogleProof {
  subject: string;
  email: string;
  verifiedAt: string;
}

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export function googleSignatureEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_SIGNATURE_CLIENT_ID?.trim() &&
    (process.env.SIGNATURE_GOOGLE_NONCE_SECRET?.length ?? 0) >= 32
  );
}

function hashInvitation(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueGoogleSignatureNonce(
  token: string, kind: SignatureMode, secret: string, now = Date.now(),
): string {
  if (secret.length < 32) throw new Error("Integração Google ainda não configurada.");
  const body: NonceData = {
    kind, invitationHash: hashInvitation(token),
    expires: now + 5 * 60 * 1000,
    salt: randomBytes(16).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + mac;
}

export function validateGoogleSignatureNonce(
  nonce: string, token: string, kind: SignatureMode, secret: string, now = Date.now(),
): void {
  const parts = nonce.split(".");
  if (parts.length !== 2 || parts.some((part) => part.length > 500 || !/^[a-zA-Z0-9_-]+$/.test(part))) {
    throw new Error("Confirmação Google inválida ou expirada.");
  }
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Confirmação Google inválida ou expirada.");
  }
  let data: NonceData;
  try {
    data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as NonceData;
  } catch {
    throw new Error("Confirmação Google inválida ou expirada.");
  }
  if (data.kind !== kind || data.invitationHash !== hashInvitation(token) ||
      !Number.isFinite(data.expires) || data.expires < now || data.expires > now + 5 * 60 * 1000) {
    throw new Error("Confirmação Google não corresponde ao convite ou expirou.");
  }
}

interface GoogleKey {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}

async function googlePublicKeys(): Promise<GoogleKey[]> {
  const response = await fetch(CERTS_URL, { cache: "force-cache", next: { revalidate: 1800 } });
  if (!response.ok) throw new Error("Não foi possível validar a identidade Google agora.");
  const jwks = await response.json() as { keys?: GoogleKey[] };
  if (!Array.isArray(jwks.keys)) throw new Error("Resposta de chaves Google inválida.");
  return jwks.keys;
}

/**
 * Validação REAL do JWT do Google (RS256 + JWK do Google + aud/iss/exp/iat
 * + nonce + e-mail confirmado). O token é descartado depois; salvamos só
 * os dados mínimos de evidência.
 */
export async function verifyGoogleSignatureCredential(
  credential: string,
  expectedNonce: string,
  expectedEmail: string,
  clientId: string,
  options?: { publicKeys?: () => Promise<GoogleKey[]>; nowSeconds?: number },
): Promise<VerifiedGoogleProof> {
  if (credential.length < 100 || credential.length > 16000) throw new Error("Credencial Google inválida.");
  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Credencial Google inválida.");

  let header: { kid?: string; alg?: string };
  let claims: {
    iss?: string; aud?: string | string[]; azp?: string; sub?: string;
    email?: string; email_verified?: boolean; nonce?: string;
    exp?: number; iat?: number;
  };
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Credencial Google inválida.");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Assinatura Google inválida.");
  const keys = await (options?.publicKeys?.() ?? googlePublicKeys());
  const selected = keys.find((key) =>
    key.kid === header.kid && key.kty === "RSA" && key.n && key.e &&
    (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256")
  );
  if (!selected) throw new Error("Certificado Google não encontrado.");
  // Montar o objeto JWK esperado pelo crypto do Node, não o tipo DOM
  // JsonWebKey (que tem estrutura diferente em algumas versões de TS).
  const publicKey = createPublicKey({
    key: { kty: "RSA", n: selected.n, e: selected.e },
    format: "jwk",
  });
  if (!verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1], "utf8"),
    publicKey, Buffer.from(parts[2], "base64url"))) {
    throw new Error("Assinatura Google inválida.");
  }

  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss ?? "") ||
      claims.aud !== clientId || (claims.azp && claims.azp !== clientId) ||
      typeof claims.exp !== "number" || claims.exp < now ||
      typeof claims.iat !== "number" || claims.iat > now + 60 ||
      claims.nonce !== expectedNonce ||
      typeof claims.sub !== "string" || claims.sub.length < 5 || claims.sub.length > 255 ||
      claims.email_verified !== true ||
      typeof claims.email !== "string" ||
      claims.email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) {
    throw new Error("Conta Google não confirmada para o e-mail deste convite.");
  }
  return {
    subject: claims.sub,
    email: claims.email.toLowerCase(),
    verifiedAt: new Date(now * 1000).toISOString(),
  };
}
