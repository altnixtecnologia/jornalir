import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseEnvironment, NfseTransmissionAttempt, NfseTransmissionStatus } from "@ir/types";
import type { NewTransmissionAttemptRecord, TransmissionAttemptRepository } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

// Preview — em memória só pela duração do processo, mesmo princípio dos
// demais módulos em SYSTEM_LOCAL_PREVIEW=1 (ver payment_charges). Semeado
// com uma tentativa rejeitada de demonstração (ver nfseIssuedNoteRepository.supabase.ts
// para o rascunho/nota correspondentes).
export const PREVIEW_TRANSMISSION_ATTEMPTS: NfseTransmissionAttempt[] = [
  {
    id: "preview-tentativa-1",
    draftId: "preview-rascunho-2",
    dpsSeries: "1",
    dpsNumber: 1,
    environment: "homologation",
    status: "rejected",
    rejectionCode: "E001",
    rejectionMessage: "Rejeição de demonstração (preview) — código de tributação municipal não localizado para o município informado.",
    createdAt: new Date(0).toISOString(),
  },
];

const TABLE = "nfse_transmission_attempts";
const COLUMNS =
  "id, draft_id, dps_series, dps_number, environment, status, request_reference, response_summary, " +
  "rejection_code, rejection_message, issued_note_id, created_by, created_at";

interface AttemptRow {
  id: string;
  draft_id: string;
  dps_series: string | null;
  dps_number: number | null;
  environment: NfseEnvironment;
  status: NfseTransmissionStatus;
  request_reference: string | null;
  response_summary: string | null;
  rejection_code: string | null;
  rejection_message: string | null;
  issued_note_id: string | null;
  created_by: string | null;
  created_at: string;
}

function toDomain(row: AttemptRow): NfseTransmissionAttempt {
  return {
    id: row.id,
    draftId: row.draft_id,
    dpsSeries: row.dps_series ?? undefined,
    dpsNumber: row.dps_number !== null ? Number(row.dps_number) : undefined,
    environment: row.environment,
    status: row.status,
    requestReference: row.request_reference ?? undefined,
    responseSummary: row.response_summary ?? undefined,
    rejectionCode: row.rejection_code ?? undefined,
    rejectionMessage: row.rejection_message ?? undefined,
    issuedNoteId: row.issued_note_id ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

/** Histórico técnico de tentativas (Parte 2A, item 11) — nunca
 * update/delete; cada tentativa é uma linha nova, imutável. */
export function createTransmissionAttemptRepositorySupabase(client: SupabaseClient): TransmissionAttemptRepository {
  return {
    async listByDraftId(draftId) {
      if (isLocalPreviewEnabled()) return PREVIEW_TRANSMISSION_ATTEMPTS.filter((a) => a.draftId === draftId);
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("draft_id", draftId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as AttemptRow));
    },

    async create(record: NewTransmissionAttemptRecord) {
      if (isLocalPreviewEnabled()) {
        const attempt: NfseTransmissionAttempt = {
          id: `preview-tentativa-${Date.now()}`,
          draftId: record.draftId,
          dpsSeries: record.dpsSeries,
          dpsNumber: record.dpsNumber,
          environment: record.environment,
          status: record.status,
          requestReference: record.requestReference,
          responseSummary: record.responseSummary,
          rejectionCode: record.rejectionCode,
          rejectionMessage: record.rejectionMessage,
          issuedNoteId: record.issuedNoteId,
          createdAt: new Date().toISOString(),
        };
        PREVIEW_TRANSMISSION_ATTEMPTS.push(attempt);
        return attempt;
      }
      const { data, error } = await client
        .from(TABLE)
        .insert({
          draft_id: record.draftId,
          dps_series: record.dpsSeries ?? null,
          dps_number: record.dpsNumber ?? null,
          environment: record.environment,
          status: record.status,
          request_reference: record.requestReference ?? null,
          response_summary: record.responseSummary ?? null,
          rejection_code: record.rejectionCode ?? null,
          rejection_message: record.rejectionMessage ?? null,
          issued_note_id: record.issuedNoteId ?? null,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as AttemptRow);
    },
  };
}
