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
  /** Só o certificado ATIVO (nunca mais de um ativo por configuração — ver deactivateAll). */
  getActive(issuerConfigId: string): Promise<StoredCertificateRecord | null>;
  create(record: NewCertificateRecord): Promise<StoredCertificateRecord>;
  /** Chamado ANTES de criar um novo certificado — "substituir certificado" nunca deixa dois ativos ao mesmo tempo. */
  deactivateAll(issuerConfigId: string): Promise<void>;
}
