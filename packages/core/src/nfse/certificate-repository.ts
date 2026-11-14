import type { EncryptedSecret } from "./secret-store";

/**
 * Persistência do certificado digital A1 validado (Parte 2B) — a
 * chave privada SEMPRE chega aqui já criptografada (ver secret-store.ts);
 * este repositório/sua implementação Supabase nunca decifra nada, só
 * guarda e devolve o ciphertext. Decifrar só acontece no momento de
 * assinar (ver certificate-service.ts), nunca antes, nunca em cache.
 */
export interface StoredCertificateRecord {
  id: string;
  issuerConfigId: string;
  subjectCnpj?: string;
  subjectName?: string;
  issuerName?: string;
  serialNumber: string;
  fingerprint: string;
  validFrom: string;
  validUntil: string;
  /** Certificado X.509 é informação PÚBLICA — guardado em claro (PEM), nunca criptografado como a chave privada. */
  certificatePem: string;
  encryptedPrivateKey: EncryptedSecret;
  active: boolean;
  createdByProfileId?: string;
  createdAt: string;
}

export type NewCertificateRecord = Omit<StoredCertificateRecord, "id" | "active" | "createdAt">;

export interface CertificateRepository {
  /** Somente o certificado ativo do prestador. */
  getActive(issuerConfigId: string): Promise<StoredCertificateRecord | null>;
  /**
   * Troca o certificado em uma transação única:
   * bloqueia o emitente, desativa o anterior e insere o novo.
   * Se a inserção falhar, o certificado anterior permanece ativo.
   * Nunca expor as operações separadas de desativar/inserir ao serviço.
   */
  replaceActive(record: NewCertificateRecord): Promise<StoredCertificateRecord>;
}
