import type { NfseCertificateInfo } from "@ir/types";
import { parsePfx, PfxCnpjNotFoundError, PfxInvalidError, PfxNoCertificateError, PfxNoPrivateKeyError, PfxWrongPasswordError } from "./pfx-parser";
import { decryptSecret, encryptSecret } from "./secret-store";
import type { CertificateRepository, StoredCertificateRecord } from "./certificate-repository";

export { PfxCnpjNotFoundError, PfxInvalidError, PfxNoCertificateError, PfxNoPrivateKeyError, PfxWrongPasswordError };

export class CertificateCnpjMismatchError extends Error {
  constructor(expectedCnpj: string, foundCnpj: string) {
    super(`O certificado pertence ao CNPJ ${foundCnpj}, diferente do CNPJ configurado do prestador (${expectedCnpj}).`);
  }
}
export class CertificateExpiredError extends Error {
  constructor(validUntil: Date) {
    super(`Certificado vencido em ${validUntil.toISOString().slice(0, 10)} — não é possível configurar um certificado já expirado.`);
  }
}

function toCertificateInfo(record: StoredCertificateRecord): NfseCertificateInfo {
  return {
    id: record.id,
    subjectCnpj: record.subjectCnpj,
    subjectName: record.subjectName,
    issuerName: record.issuerName,
    serialNumber: record.serialNumber,
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    active: record.active,
    createdAt: record.createdAt,
  };
}

/**
 * Valida um PFX/P12 recém enviado pelo painel e, se tudo bater, guarda
 * o material de assinatura CRIPTOGRAFADO (Parte 2B, item "Certificado
 * digital A1"). Nunca recebe a senha de volta depois de validar; nunca
 * devolve a chave privada pro chamador (só a metadata seguro de
 * `NfseCertificateInfo`).
 *
 * Rejeita (lançando erro tipado, nunca "fingindo sucesso"): arquivo
 * inválido, senha errada, sem chave privada/certificado, CNPJ não
 * localizável no SAN/otherName OID 2.16.76.1.3.3 (ver pfx-parser.ts —
 * nunca inferido do CN), certificado vencido, ou CNPJ do certificado
 * diferente do CNPJ configurado do prestador.
 */
export class CertificateService {
  constructor(private readonly certificates: CertificateRepository) {}

  async validateAndStore(input: {
    issuerConfigId: string;
    expectedCnpjDigits: string;
    pfxBuffer: Buffer;
    password: string;
    actorProfileId?: string;
  }): Promise<NfseCertificateInfo> {
    const parsed = parsePfx(input.pfxBuffer, input.password);

    if (parsed.validUntil.getTime() < Date.now()) {
      throw new CertificateExpiredError(parsed.validUntil);
    }
    // parsed.subjectCnpj é SEMPRE o CNPJ do SAN/otherName (pfx-parser.ts
    // já lança PfxCnpjNotFoundError se não conseguir ler — nunca chega
    // aqui sem um CNPJ confiável).
    if (parsed.subjectCnpj !== input.expectedCnpjDigits) {
      throw new CertificateCnpjMismatchError(input.expectedCnpjDigits, parsed.subjectCnpj);
    }

    const encryptedPrivateKey = encryptSecret(parsed.privateKeyPem);

    await this.certificates.deactivateAll(input.issuerConfigId);
    const stored = await this.certificates.create({
      issuerConfigId: input.issuerConfigId,
      subjectCnpj: parsed.subjectCnpj,
      subjectName: parsed.subjectName,
      issuerName: parsed.issuerName,
      serialNumber: parsed.serialNumber,
      validFrom: parsed.validFrom.toISOString(),
      validUntil: parsed.validUntil.toISOString(),
      certificatePem: parsed.certificatePem,
      encryptedPrivateKey,
      createdByProfileId: input.actorProfileId,
    });

    return toCertificateInfo(stored);
  }

  async getActiveInfo(issuerConfigId: string): Promise<NfseCertificateInfo | null> {
    const record = await this.certificates.getActive(issuerConfigId);
    return record ? toCertificateInfo(record) : null;
  }

  /** SÓ pra assinatura, nunca pra UI — decifra a chave privada em memória, nunca loga/persiste em texto. */
  async getActiveSigningMaterial(issuerConfigId: string): Promise<{ privateKeyPem: string; certificatePem: string } | null> {
    const record = await this.certificates.getActive(issuerConfigId);
    if (!record) return null;
    return { privateKeyPem: decryptSecret(record.encryptedPrivateKey), certificatePem: record.certificatePem };
  }
}
