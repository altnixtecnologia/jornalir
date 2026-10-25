"use server";

import { revalidatePath } from "next/cache";
import { getCommercialProposalService } from "../../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import { toCommercialProposalServiceInput, type CommercialProposalFormInput } from "../commercialProposalFormTypes";

const ENTITY_TYPE = "commercial_proposal";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export async function createCommercialProposalAction(input: CommercialProposalFormInput): Promise<{ error: string } | { id: string }> {
  const permissionError = await checkModuleAction("publicidade", "propostas_criar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const proposal = await getCommercialProposalService(client).register(toCommercialProposalServiceInput(input));
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: proposal.id, action: "create", metadata: { reference: proposal.reference } });
    revalidatePath("/sistema/publicidade/propostas");
    revalidatePath("/sistema/publicidade");
    return { id: proposal.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
