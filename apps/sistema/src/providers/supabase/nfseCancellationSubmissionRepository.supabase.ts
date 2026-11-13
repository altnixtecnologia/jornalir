import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseCancellationRequest, NfseCancellationStatus } from "@ir/types";
import type { CancellationSubmissionRepository } from "@ir/core/src/nfse/cancellation-submission-repository";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "nfse_cancellation_requests";
const COLUMNS = "id, issued_note_id, justification_code, justification_text, status, requested_by, requested_at, submitted_at, response_summary, rejection_code, rejection_message, created_at";

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
    id: row.id, issuedNoteId: row.issued_note_id,
    justificationCode: row.justification_code,
    justificationText: row.justification_text,
    status: row.status, requestedByProfileId: row.requested_by ?? undefined,
    requestedAt: row.requested_at, submittedAt: row.submitted_at ?? undefined,
    responseSummary: row.response_summary ?? undefined,
    rejectionCode: row.rejection_code ?? undefined,
    rejectionMessage: row.rejection_message ?? undefined,
    createdAt: row.created_at,
  };
}

async function privilegedClient(session: SupabaseClient): Promise<SupabaseClient> {
  // Esta fabrica nunca funciona no modo demonstracao local.
  if (isLocalPreviewEnabled()) throw new Error("Envio real de cancelamento indisponível na demonstração.");
  const { data, error } = await session.rpc("is_active_admin_or_owner");
  if (error || data !== true) throw new Error("Somente administradores podem processar um cancelamento fiscal.");
  return createSupabaseAdminClient();
}

/** A tabela e service_role-only. Cada transicao exige CAS via status. */
export function createCancellationSubmissionRepositorySupabase(
  session: SupabaseClient,
): CancellationSubmissionRepository {
  return {
    async getById(id) {
      const admin = await privilegedClient(session);
      const { data, error } = await admin.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as CancellationRow) : null;
    },

    async claimPending(id) {
      const admin = await privilegedClient(session);
      const { data, error } = await admin.from(TABLE).update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      }).eq("id", id).eq("status", "pending").select(COLUMNS).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as CancellationRow) : null;
    },

    async settleSubmitted(id, result) {
      const admin = await privilegedClient(session);
      const { data, error } = await admin.from(TABLE).update({
        status: result.status,
        response_summary: result.responseSummary.slice(0, 500),
        rejection_code: result.rejectionCode?.slice(0, 100) ?? null,
        rejection_message: result.rejectionMessage?.slice(0, 700) ?? null,
      }).eq("id", id).eq("status", "submitted").select(COLUMNS).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Estado fiscal mudou durante o registro do resultado; concilie o cancelamento.");
      return toDomain(data as unknown as CancellationRow);
    },
  };
}
