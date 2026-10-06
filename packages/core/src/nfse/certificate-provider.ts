/**
 * Certificado digital (Parte 2A, item 4) — ESTRITAMENTE server-side.
 * NUNCA enviado ao browser, NUNCA persistido em banco (senha/PFX/
 * chave privada), NUNCA registrado em log/erro/auditoria. Carregado
 * só de variável de ambiente do servidor — fora do código/repositório.
 *
 * Suporte inicial: A1/PKCS#12 por segredo de ambiente. A3 (token/HSM)
 * não é implementado nesta fase, mas nada aqui impede acrescentar
 * outro `CertificateMaterial`/loader no futuro.
 */

export type NfseCertificateKind = "a1";

export interface CertificateMaterial {
  kind: NfseCertificateKind;
  /** PKCS#12 (.pfx/.p12) em base64 — nunca logado, nunca devolvido pra UI. */
  pfxBase64: string;
  /** Nunca logado, nunca devolvido pra UI. */
  passphrase: string;
}

const ENV_PFX_BASE64 = "NFSE_CERTIFICATE_PFX_BASE64";
const ENV_PASSPHRASE = "NFSE_CERTIFICATE_PASSPHRASE";

/** Lê o certificado de variáveis de ambiente do servidor. Nunca lança
 * erro com o conteúdo das variáveis — só diz se está configurado. */
export function loadCertificateFromEnv(): CertificateMaterial | null {
  const pfxBase64 = process.env[ENV_PFX_BASE64];
  const passphrase = process.env[ENV_PASSPHRASE];
  if (!pfxBase64 || !passphrase) return null;
  return { kind: "a1", pfxBase64, passphrase };
}

export function isCertificateConfigured(): boolean {
  return loadCertificateFromEnv() !== null;
}

/**
 * Extração do par chave privada/certificado X.509 a partir do PKCS#12
 * — DELIBERADAMENTE NÃO IMPLEMENTADA nesta fase. O Node.js não expõe
 * extração de chave privada de um PFX na API nativa de `crypto`
 * (só `tls.createSecureContext`, que serve pra handshake TLS, não pra
 * assinar XML); fazer isso de forma correta exige uma biblioteca de
 * parsing PKCS#12 (ex.: `node-forge`), que ainda não é dependência
 * deste projeto. Documentado aqui em vez de escrever uma extração não
 * verificada: sem certificado real pra testar, qualquer implementação
 * agora seria código não validado se fingindo de pronto.
 *
 * Quando a integração real for feita: adicionar a dependência
 * escolhida, implementar esta função, e então `signDpsXml`
 * (ver signature.ts) passa a ser chamável de ponta a ponta.
 */
export function extractKeyMaterialFromPfx(_material: CertificateMaterial): never {
  throw new Error(
    "Extração de chave privada do certificado PFX ainda não implementada — requer uma dependência de parsing PKCS#12 (ex.: node-forge), que ainda não existe no projeto. Ver certificate-provider.ts.",
  );
}
