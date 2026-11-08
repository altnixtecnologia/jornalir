"use server";

import { revalidatePath } from "next/cache";
import { getCommercialProductService, getCommercialProposalService } from "../../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import { guardNegotiatedValues } from "../../../../../lib/contracts/negotiatedValuesGuard";
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
    const serviceInput = toCommercialProposalServiceInput(input);
    // Valor diferente da tabela do catálogo exige "valores_negociar" (item livre não é afetado).
    const negotiationError = await guardNegotiatedValues(serviceInput.items, {
      loadListPrices: async (ids) => {
        const products = await getCommercialProductService(client).list();
        return new Map(products.filter((product) => ids.includes(product.id)).map((product) => [product.id, product.suggestedPrice]));
      },
      canNegotiate: async () => (await checkModuleAction("publicidade", "valores_negociar")) === null,
    });
    if (negotiationError) return { error: negotiationError };
    const proposal = await getCommercialProposalService(client).register(serviceInput);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: proposal.id, action: "create", metadata: { reference: proposal.reference } });
    revalidatePath("/sistema/publicidade/propostas");
    revalidatePath("/sistema/publicidade");
    return { id: proposal.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
