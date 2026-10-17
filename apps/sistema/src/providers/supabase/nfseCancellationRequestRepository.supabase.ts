import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseCancellationRequest, NfseCancellationStatus } from "@ir/types";
import type { CancellationRequestRepository, NewCancellationRequestRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const PREVIEW_REQUESTS: NfseCancellationRequest[] = [];

const TABLE = "nfse_cancellation_requests";
const COLUMNS =
  "id, issued_note_id, justification_code, justification_text, status, requested_by, requested_at, " +
  "submitted_at, response_summary, rejection_code, rejection_message, created_at";

interface CancellationRow {
  id: string;
  issued_note_id: string;
  justification_code: 1 | 2 | 9;
  justification_text: string;
  status: NfseCancellationStatus;
  requested_by: string | null;
  requested_at: string;
  submitted_at: string | null;
  response_summary: string | null;
  rejection_code: string | null;
  rejection_message: string | null;
  created_at: string;
}

function toDomain(row: CancellationRow): NfseCancellationRequest {
  return {
    id: row.id,
    issuedNoteId: row.issued_note_id,
    justificationCode: row.justification_code,
    justificationText: row.justification_text,
    status: row.status,
    requestedByProfileId: row.requested_by ?? undefined,
    requestedAt: row.requested_at,
    submittedAt: row.submitted_at ?? undefined,
    responseSummary: row.response_summary ?? undefined,
    rejectionCode: row.rejection_code ?? undefined,
    rejectionMessage: row.rejection_message ?? undefined,
    createdAt: row.created_at,
  };
}

const ACTIVE_STATUSES: NfseCancellationStatus[] = ["pending", "submitted", "confirmed"];

/** Preparação do cancelamento (Item 5, Lote 2, Tarefa 5) — histórico imutável, sem update/delete; cada resultado é uma linha nova. */
export function createCancellationRequestRepositorySupabase(client: SupabaseClient): CancellationRequestRepository {
  return {
    async listByIssuedNoteId(issuedNoteId) {
      if (isLocalPreviewEnabled()) return PREVIEW_REQUESTS.filter((r) => r.issuedNoteId === issuedNoteId);
      const { data, error } = await client.from(TABLE).select(COLUMNS)
        .eq("issued_note_id", issuedNoteId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as CancellationRow));
    },

    async getActiveByIssuedNoteId(issuedNoteId) {
      if (isLocalPreviewEnabled()) {
        return PREVIEW_REQUESTS.find((r) => r.issuedNoteId === issuedNoteId && ACTIVE_STATUSES.includes(r.status)) ?? null;
      }
      const { data, error } = await client.from(TABLE).select(COLUMNS)
        .eq("issued_note_id", issuedNoteId).in("status", ACTIVE_STATUSES).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as CancellationRow) : null;
    },

    async create(record: NewCancellationRequestRecord) {
      if (isLocalPreviewEnabled()) {
        const created: NfseCancellationRequest = {
          id: `preview-cancelamento-${Date.now()}`,
          issuedNoteId: record.issuedNoteId,
          justificationCode: record.justificationCode,
          justificationText: record.justificationText,
          status: "pending",
          requestedByProfileId: record.requestedByProfileId,
          requestedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        PREVIEW_REQUESTS.push(created);
        return created;
      }
      const { data, error } = await client.from(TABLE).insert({
        issued_note_id: record.issuedNoteId,
        justification_code: record.justificationCode,
        justification_text: record.justificationText,
        requested_by: record.requestedByProfileId ?? null,
      }).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as CancellationRow);
    },
  };
}
