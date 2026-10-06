import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cofre de material criptográfico sensível (Parte 2B, item "Armazenamento
 * seguro") — a senha do PFX NUNCA é armazenada; só a chave privada/
 * certificado JÁ EXTRAÍDOS (ver pfx-parser.ts) são criptografados aqui
 * antes de ir pro banco. A chave mestra vem SÓ de variável de ambiente
 * do servidor (`NFSE_CERTIFICATE_MASTER_KEY`, 32 bytes em base64) —
 * NUNCA do banco, nunca do browser.
 *
 * AES-256-GCM: cada segredo tem seu próprio IV aleatório (12 bytes) e
 * auth tag (16 bytes) — adulteração do ciphertext falha a decifragem
 * por autenticação (GCM), nunca retorna um texto corrompido
 * silenciosamente.
 */

const ENV_MASTER_KEY = "NFSE_CERTIFICATE_MASTER_KEY";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export class SecretStoreNotConfiguredError extends Error {
  constructor() {
    super(`Chave mestra de criptografia não configurada (variável de ambiente ${ENV_MASTER_KEY}) — armazenamento de certificado bloqueado.`);
  }
}
export class SecretDecryptionError extends Error {
  constructor() {
    super("Falha ao decifrar o segredo — ciphertext adulterado/corrompido ou chave mestra incorreta.");
  }
}

export interface EncryptedSecret {
  ciphertextBase64: string;
  ivBase64: string;
  authTagBase64: string;
}

function loadMasterKey(): Buffer {
  const base64 = process.env[ENV_MASTER_KEY];
  if (!base64) throw new SecretStoreNotConfiguredError();
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new SecretStoreNotConfiguredError();
  }
  return key;
}

export function isSecretStoreConfigured(): boolean {
  try {
    loadMasterKey();
    return true;
  } catch {
    return false;
  }
}

/** Nunca loga o `plaintext`. Lança `SecretStoreNotConfiguredError` se a chave mestra não existir. */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = loadMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertextBase64: ciphertext.toString("base64"),
    ivBase64: iv.toString("base64"),
    authTagBase64: authTag.toString("base64"),
  };
}

/** Lança `SecretDecryptionError` se o ciphertext/authTag não corresponderem (adulteração ou chave errada) — nunca devolve um texto parcial/corrompido. */
export function decryptSecret(secret: EncryptedSecret): string {
  const key = loadMasterKey();
  const iv = Buffer.from(secret.ivBase64, "base64");
  const authTag = Buffer.from(secret.authTagBase64, "base64");
  const ciphertext = Buffer.from(secret.ciphertextBase64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new SecretDecryptionError();
  }
}
