"use server";

import { revalidatePath } from "next/cache";
import { getCommercialProductService, getCommercialSaleService } from "../../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import { toNewCommercialSaleServiceInput, type CommercialSaleFormInput } from "../commercialSaleFormTypes";

const ENTITY_TYPE = "commercial_sale";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export async function createCommercialSaleAction(input: CommercialSaleFormInput): Promise<{ error: string } | { id: string }> {
  const permissionError = await checkModuleAction("publicidade", "vendas_criar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    // Nunca confiar no valor total vindo da interface. Buscar preços e
    // produtos válidos no catálogo atual e calcular no servidor.
    const products = await getCommercialProductService(client).list({ activeOnly: true });
    const sale = await getCommercialSaleService(client).register(toNewCommercialSaleServiceInput(input, products));
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: sale.id, action: "create", metadata: { reference: sale.reference } });
    revalidatePath("/sistema/publicidade/vendas");
    revalidatePath("/sistema/publicidade");
    return { id: sale.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
