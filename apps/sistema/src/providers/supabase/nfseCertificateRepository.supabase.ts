import "server-only";
import type { CertificateRepository, NewCertificateRecord, StoredCertificateRecord } from "@ir/core/src/nfse/certificate-repository";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

// Certificado demonstrativo (preview) — dados FICTÍCIOS, nunca um PFX/chave
// real. encryptedPrivateKey nunca é decifrado neste caminho (CertificateService.getActiveInfo
// só expõe campos seguros) — a chave "cifrada" aqui é só um placeholder,
// jamais usada pra assinar nada (transmissão real já é bloqueada em
// qualquer ambiente, ver RealTransmissionNotReadyError).
const PREVIEW_CERTIFICATE: StoredCertificateRecord = {
  id: "preview-certificado-1",
  issuerConfigId: "preview-issuer-config-1",
  subjectCnpj: "23970969000190",
  subjectName: "INFORMATIVO REGIONAL LTDA (demonstração)",
  issuerName: "AC Demonstração (preview)",
  serialNumber: "00:PREVIEW:00",
  fingerprint: "00:PREVIEW:FINGERPRINT:00",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:00.000Z",
  certificatePem: "-----BEGIN CERTIFICATE-----\nPREVIEW-DEMO-ONLY\n-----END CERTIFICATE-----",
  encryptedPrivateKey: { ciphertextBase64: "preview", ivBase64: "preview", authTagBase64: "preview" },
  active: true,
  createdAt: new Date(0).toISOString(),
};

const TABLE = "nfse_certificates";
const COLUMNS =
  "id, issuer_config_id, subject_cnpj, subject_name, issuer_name, serial_number, fingerprint, valid_from, valid_until, certificate_pem, " +
  "private_key_ciphertext, private_key_iv, private_key_auth_tag, active, created_by, created_at";

interface CertificateRow {
  id: string;
  issuer_config_id: string;
  subject_cnpj: string | null;
  subject_name: string | null;
  issuer_name: string | null;
  serial_number: string;
  fingerprint: string;
  valid_from: string;
  valid_until: string;
  certificate_pem: string;
  private_key_ciphertext: string;
  private_key_iv: string;
  private_key_auth_tag: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

function toDomain(row: CertificateRow): StoredCertificateRecord {
  return {
    id: row.id,
    issuerConfigId: row.issuer_config_id,
    subjectCnpj: row.subject_cnpj ?? undefined,
    subjectName: row.subject_name ?? undefined,
    issuerName: row.issuer_name ?? undefined,
    serialNumber: row.serial_number,
    fingerprint: row.fingerprint,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    certificatePem: row.certificate_pem,
    encryptedPrivateKey: {
      ciphertextBase64: row.private_key_ciphertext,
      ivBase64: row.private_key_iv,
      authTagBase64: row.private_key_auth_tag,
    },
    active: row.active,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Certificado digital A1 validado e criptografado (Parte 2B). Nunca
 * decifra nada aqui — só guarda/devolve o ciphertext (ver
 * certificate-service.ts, que decifra só no momento de assinar).
 * A RPC `replace_nfse_certificate_atomic` bloqueia o prestador,
 * desativa o certificado antigo e insere o novo na MESMA transacao.
 * Um erro no INSERT reverte a desativacao; o indice parcial
 * `nfse_certificates_one_active_per_issuer` continua como defesa extra.
 *
 * Acesso EXCLUSIVO via `service_role` (migration de hardening
 * `nfse_initial_integration_security` revoga anon/authenticated da
 * tabela) — por isso este repositório nunca recebe o client de sessão
 * do usuário, e cria o client admin só dentro de cada operação real
 * (nunca no modo preview, que continua funcionando sem
 * SUPABASE_SERVICE_ROLE_KEY configurada).
 */
export function createCertificateRepositorySupabase(): CertificateRepository {
  return {
    async getActive(issuerConfigId: string) {
      if (isLocalPreviewEnabled()) return PREVIEW_CERTIFICATE;
      const client = createSupabaseAdminClient();
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("issuer_config_id", issuerConfigId).eq("active", true).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as CertificateRow) : null;
    },

    async replaceActive(record: NewCertificateRecord) {
      const client = createSupabaseAdminClient();
      // Nunca fazer UPDATE de desativacao + INSERT em requests separados.
      // O banco reverte a operacao INTEIRA se a gravacao do novo A1 falhar.
      const { data: certificateId, error: rotationError } = await client.rpc("replace_nfse_certificate_atomic", {
        p_issuer_config_id: record.issuerConfigId,
        p_subject_cnpj: record.subjectCnpj ?? null,
        p_subject_name: record.subjectName ?? null,
        p_issuer_name: record.issuerName ?? null,
        p_serial_number: record.serialNumber,
        p_fingerprint: record.fingerprint,
        p_valid_from: record.validFrom,
        p_valid_until: record.validUntil,
        p_certificate_pem: record.certificatePem,
        p_private_key_ciphertext: record.encryptedPrivateKey.ciphertextBase64,
        p_private_key_iv: record.encryptedPrivateKey.ivBase64,
        p_private_key_auth_tag: record.encryptedPrivateKey.authTagBase64,
        p_created_by: record.createdByProfileId ?? null,
      });
      if (rotationError) throw new Error(rotationError.message);
      if (typeof certificateId !== "string") throw new Error("A rotacao do certificado nao retornou um identificador valido.");

      // Busca pelo ID retornado, nunca por "ativo" (outra rotacao pode
      // ocorrer imediatamente apos a transacao e alterar o ativo atual).
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", certificateId).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as CertificateRow);
    },
  };
}
