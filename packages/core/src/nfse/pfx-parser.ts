import forge from "node-forge";

/**
 * Parsing de certificado digital A1 (.pfx/.p12) — Parte 2B, item
 * "Certificado digital A1". ESTRITAMENTE server-side: a senha chega só
 * até aqui, nunca é persistida (nem em texto, nem em log), e esta
 * função nunca devolve a senha de volta pro chamador.
 *
 * Biblioteca escolhida: `node-forge` — pure JS (sem dependência
 * nativa do sistema operacional, compatível com Node/Vercel). Tem uma
 * vulnerabilidade conhecida e sem correção disponível
 * (GHSA-86w9-cpqp-85rv), mas ela é sobre VERIFICAÇÃO de assinatura
 * RSA PKCS#1 v1.5 de terceiros — nunca usada aqui (só extraímos chave/
 * certificado do PFX que o próprio admin acabou de enviar; nunca
 * verificamos uma assinatura de origem não confiável com esta lib).
 */

export class PfxInvalidError extends Error {
  constructor(detail?: string) {
    super(`Arquivo PFX/P12 inválido ou corrompido.${detail ? ` (${detail})` : ""}`);
  }
}
export class PfxWrongPasswordError extends Error {
  constructor() {
    super("Senha do certificado incorreta.");
  }
}
export class PfxNoPrivateKeyError extends Error {
  constructor() {
    super("O arquivo PFX/P12 não contém uma chave privada.");
  }
}
export class PfxNoCertificateError extends Error {
  constructor() {
    super("O arquivo PFX/P12 não contém um certificado.");
  }
}
/**
 * AJUSTE (fonte normativa do CNPJ): o CN do certificado NUNCA é usado
 * pra extrair/validar CNPJ — só pra exibição (subjectName). A fonte
 * normativa é o Subject Alternative Name / otherName, OID 2.16.76.1.3.3
 * (ICP-Brasil/ITI, DOC-ICP-04 — contém o CNPJ de 14 posições da pessoa
 * jurídica titular do certificado). Se esse OID não existir ou não puder
 * ser lido de forma confiável, falhamos explicitamente em vez de
 * inferir o CNPJ de qualquer outro campo (ex.: CN).
 */
export class PfxCnpjNotFoundError extends Error {
  constructor() {
    super(
      "Não foi possível ler o CNPJ do certificado pela extensão Subject Alternative Name (otherName, OID 2.16.76.1.3.3 — ICP-Brasil/ITI). Esse OID é obrigatório para certificados e-CNPJ; o CN nunca é usado como fonte de CNPJ.",
    );
  }
}

export interface ParsedPfx {
  privateKeyPem: string;
  certificatePem: string;
  /** Só dígitos (14) — SEMPRE extraído da extensão SAN/otherName (OID 2.16.76.1.3.3), nunca do CN. Garantido presente (ver PfxCnpjNotFoundError). */
  subjectCnpj: string;
  /** Só pra exibição (nome/titular) — nunca usado para validar CNPJ. */
  subjectName?: string;
  issuerName?: string;
  serialNumber: string;
  validFrom: Date;
  validUntil: Date;
}

const ICP_BRASIL_CNPJ_OID = "2.16.76.1.3.3";
/** GeneralName ::= CHOICE { otherName [0], ... } — tag CONTEXT_SPECIFIC 0. */
const SAN_OTHER_NAME_TYPE = 0;

interface ForgeAsn1Like {
  value: string | ForgeAsn1Like[];
}

/**
 * Extrai o CNPJ (14 dígitos) do SAN/otherName com OID 2.16.76.1.3.3.
 * OtherName ::= SEQUENCE { type-id OBJECT IDENTIFIER, value [0] EXPLICIT ANY }
 * — por isso cada `otherName` decodificado pelo node-forge chega como um
 * array de 2 nós ASN.1: [0] o OID, [1] o wrapper EXPLICIT contendo o
 * valor real (string) em mais um nível. Nunca lê/loga o SAN bruto —
 * só devolve os dígitos do CNPJ encontrado (ou nada).
 */
function extractCnpjFromSanOtherName(cert: forge.pki.Certificate): string | undefined {
  const san = cert.getExtension("subjectAltName") as { altNames?: Array<{ type: number; value: unknown }> } | null;
  if (!san?.altNames) return undefined;

  for (const altName of san.altNames) {
    if (altName.type !== SAN_OTHER_NAME_TYPE) continue;
    const children = altName.value;
    if (!Array.isArray(children) || children.length < 2) continue;

    const oidNode = children[0] as ForgeAsn1Like;
    if (typeof oidNode.value !== "string") continue;
    let oid: string;
    try {
      oid = forge.asn1.derToOid(oidNode.value);
    } catch {
      continue;
    }
    if (oid !== ICP_BRASIL_CNPJ_OID) continue;

    const explicitWrapper = children[1] as ForgeAsn1Like;
    const inner = explicitWrapper.value;
    if (!Array.isArray(inner) || inner.length === 0) continue;
    const valueNode = inner[0] as ForgeAsn1Like;
    if (typeof valueNode.value !== "string") continue;

    const digits = valueNode.value.replace(/\D/g, "");
    if (digits.length === 14) return digits;
  }

  return undefined;
}

function commonNameOf(attrs: forge.pki.CertificateField[]): string | undefined {
  const cn = attrs.find((attr) => attr.name === "commonName" || attr.type === "2.5.4.3");
  return cn?.value as string | undefined;
}

/**
 * Faz o parsing do PFX/P12 e devolve o material pronto pra assinatura
 * (PEM) + metadata segura do certificado (nada secreto). Nunca loga o
 * conteúdo do buffer/senha/SAN bruto. Lança erros tipados pra cada
 * cenário de rejeição: arquivo inválido, senha errada, sem chave
 * privada, CNPJ não localizável no SAN (nunca inferido do CN) —
 * validade/comparação do CNPJ com o prestador são responsabilidade do
 * chamador (certificate-service.ts), que já recebe a metadata aqui.
 */
export function parsePfx(pfxBuffer: Buffer, password: string): ParsedPfx {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("mac") || message.includes("invalid password") || message.includes("decrypt")) {
      throw new PfxWrongPasswordError();
    }
    throw new PfxInvalidError(error instanceof Error ? error.message : undefined);
  }

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const unshroudedBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? unshroudedBags[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new PfxNoPrivateKeyError();

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new PfxNoCertificateError();

  const cert = certBag.cert;
  const subjectCnpj = extractCnpjFromSanOtherName(cert);
  if (!subjectCnpj) throw new PfxCnpjNotFoundError();

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificatePem: forge.pki.certificateToPem(cert),
    subjectCnpj,
    subjectName: commonNameOf(cert.subject.attributes),
    issuerName: commonNameOf(cert.issuer.attributes),
    serialNumber: cert.serialNumber,
    validFrom: cert.validity.notBefore,
    validUntil: cert.validity.notAfter,
  };
}
