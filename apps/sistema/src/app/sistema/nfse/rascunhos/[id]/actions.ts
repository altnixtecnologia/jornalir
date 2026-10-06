"use server";

import { revalidatePath } from "next/cache";
import { getTransmissionService } from "../../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";

const ENTITY_TYPE = "nfse_draft";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

/** Confirma owner/admin direto no banco (item 9.1) — mesma regra de
 * RLS (`is_active_admin_or_owner`), nunca inferida só no client. */
async function isActorAdminOrOwner(supabase: ReturnType<typeof createSupabaseServerClient>, actorId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("id", actorId).maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

export interface TransmitDraftActionResult {
  error?: string;
  outcome?: "authorized" | "rejected" | "uncertain";
  issuedNoteId?: string;
  nfseNumber?: string;
  accessKey?: string;
  rejectionMessage?: string;
}

/**
 * "Enviar NFS-e" (Parte 2A, item 9/14) — único ponto de entrada da
 * transmissão. Audita início/resultado em `public.audit_events`
 * (ação), nunca duplicando o detalhe técnico já registrado em
 * `nfse_transmission_attempts` (item 13).
 */
export async function transmitDraftAction(draftId: string): Promise<TransmitDraftActionResult> {
  const supabase = createSupabaseServerClient();
  let AUDIT;
  try {
    AUDIT = await getAuditContext(supabase);
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  const isAdminOrOwner = await isActorAdminOrOwner(supabase, AUDIT.actorId);

  await recordAuditEventSupabase(supabase, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: draftId, action: "transmission_started" });

  try {
    const result = await getTransmissionService(supabase).transmit({ draftId, isAdminOrOwner, actorProfileId: AUDIT.actorId });

    if (result.outcome === "authorized") {
      await recordAuditEventSupabase(supabase, {
        userId: AUDIT.actorId,
        entityType: ENTITY_TYPE,
        entityId: draftId,
        action: "transmission_authorized",
        metadata: { nfseNumber: result.issuedNote?.nfseNumber },
      });
      revalidatePath(`/sistema/nfse/rascunhos/${draftId}`);
      revalidatePath("/sistema/nfse/rascunhos");
      revalidatePath("/sistema/nfse/notas");
      return {
        outcome: "authorized",
        issuedNoteId: result.issuedNote?.id,
        nfseNumber: result.issuedNote?.nfseNumber,
        accessKey: result.issuedNote?.accessKey,
      };
    }

    if (result.outcome === "rejected") {
      await recordAuditEventSupabase(supabase, {
        userId: AUDIT.actorId,
        entityType: ENTITY_TYPE,
        entityId: draftId,
        action: "transmission_rejected",
        metadata: { rejectionCode: result.rejection?.code },
      });
      revalidatePath(`/sistema/nfse/rascunhos/${draftId}`);
      return { outcome: "rejected", rejectionMessage: result.rejection?.message };
    }

    await recordAuditEventSupabase(supabase, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: draftId, action: "transmission_uncertain" });
    revalidatePath(`/sistema/nfse/rascunhos/${draftId}`);
    return { outcome: "uncertain" };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
