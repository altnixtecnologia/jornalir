"use server";

import { revalidatePath } from "next/cache";
import type { CommercialSaleStatus } from "@ir/types";
import { buildCommercialBillingDescription, buildTomadorSnapshotFromClient, clientDisplayName, generateCommercialSaleInstallments } from "@ir/types";
import { DraftDuplicateOriginError } from "@ir/core";
import { getCommercialSaleService } from "../../../../../composition/comercial";
import { getReceivableService } from "../../../../../composition/financeiro";
import { getDraftService } from "../../../../../composition/nfse";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { checkFinanceAction } from "../../../../../lib/permissions/checkFinanceAction";
import { validateCommercialSaleForBilling } from "../../../../../lib/financeiro/commercialSaleBillingGuard";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import { listReceivablesForCommercialSalesSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";
import { toCommercialSaleServiceInput, type CommercialSaleFormInput } from "../commercialSaleFormTypes";

const NFSE_ORIGIN_SYSTEM = "jornal_ir";
const NFSE_ORIGIN_TYPE = "commercial_sale";

const ENTITY_TYPE = "commercial_sale";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function listPath(id: string): string {
  return `/sistema/publicidade/vendas/${id}`;
}

export async function updateCommercialSaleAction(id: string, input: CommercialSaleFormInput): Promise<{ error: string } | void> {
  const permissionError = await checkModuleAction("publicidade", "vendas_editar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const existing = await listReceivablesForCommercialSalesSupabase(client, [id]);
    const financeiroGenerated = existing.some((r) => r.status !== "cancelled");
    await getCommercialSaleService(client).update(id, toCommercialSaleServiceInput(input), { financeiroGenerated });
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "update" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(listPath(id));
  revalidatePath("/sistema/publicidade/vendas");
}

export async function changeCommercialSaleStatusAction(id: string, to: CommercialSaleStatus): Promise<{ error: string } | void> {
  const permissionError = await checkModuleAction("publicidade", "vendas_editar");
  if (permissionError) return { error: permissionError };
  try {  if (to === "cancelled") {
    const cancelError = await checkModuleAction("publicidade", "vendas_cancelar");
    if (cancelError) return { error: cancelError };
  }

    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getCommercialSaleService(client).changeStatus(id, to);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "change_status", metadata: { to } });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(listPath(id));
  revalidatePath("/sistema/publicidade/vendas");
}

/** Nunca apaga fisicamente — só status=cancelled; títulos já gerados continuam existindo e rastreáveis (item 15). */
export async function cancelCommercialSaleAction(id: string): Promise<{ error: string } | void> {
  const permissionError = await checkModuleAction("publicidade", "vendas_cancelar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getCommercialSaleService(client).cancel(id);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "cancel" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(listPath(id));
  revalidatePath("/sistema/publicidade/vendas");
}

export interface GenerateFinanceiroResult {
  installmentNumber: number;
  ok: boolean;
  error?: string;
}

/**
 * "Gerar Financeiro" (item 12/13) — nunca duplica: pré-checa e, mesmo
 * numa corrida, o índice único parcial do banco
 * (receivables_commercial_sale_installment_unique) é a proteção
 * autoritativa (ver ReceivableService.registerFromCommercialSale).
 */
export async function generateCommercialSaleFinanceiroAction(id: string, firstDueDate: string): Promise<{ results: GenerateFinanceiroResult[] } | { error: string }> {
  const permissionError = await checkModuleAction("publicidade", "vendas_editar");
  if (permissionError) return { error: permissionError };
  const financeError = await checkFinanceAction("titulos_criar");
  if (financeError) return { error: financeError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const sale = await getCommercialSaleService(client).getById(id);
    // Nunca faturar proposta/cancelada, cortesia, zero ou data inválida.
    // Revalidar no servidor antes da primeira inserção.
    const billingError=validateCommercialSaleForBilling(sale,firstDueDate);
    if(billingError) return {error:billingError};
    const drafts = generateCommercialSaleInstallments(sale, firstDueDate);
    const receivableService = getReceivableService(client);

    const results: GenerateFinanceiroResult[] = [];
    for (const draft of drafts) {
      try {
        await receivableService.registerFromCommercialSale({
          clientId: sale.clientId,
          description: draft.description,
          sourceType: "advertising",
          sourceReference: `Venda ${sale.reference}`,
          commercialSaleId: sale.id,
          installmentNumber: draft.installmentNumber,
          originalAmount: draft.amount,
          issueDate: new Date().toISOString().slice(0, 10),
          dueDate: draft.dueDate,
        });
        results.push({ installmentNumber: draft.installmentNumber, ok: true });
      } catch (error) {
        results.push({ installmentNumber: draft.installmentNumber, ok: false, error: toErrorMessage(error) });
      }
    }

    await recordAuditEventSupabase(client, {
      userId: AUDIT.actorId,
      entityType: ENTITY_TYPE,
      entityId: id,
      action: "generate_financeiro",
      metadata: { generated: results.filter((r) => r.ok).length },
    });

    revalidatePath(listPath(id));
    revalidatePath("/sistema/publicidade/vendas");
    revalidatePath("/sistema/financeiro/contas-a-receber");
    return { results };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * "Criar rascunho de NFS-e" (Fase 5) — preenche o máximo possível com
 * dados reais já conhecidos (tomador via buildTomadorSnapshotFromClient,
 * valor/competência/descrição da venda); NUNCA transmite — só cria o
 * RASCUNHO, exatamente como criar um rascunho manualmente em
 * /sistema/nfse/nova. Fiscal (cTribNac, perfil de serviço etc.) fica em
 * branco de propósito — isso é domínio do próprio módulo NFS-e, a venda
 * comercial não tem essa informação. Nunca duas vezes para a mesma
 * venda (DraftDuplicateOriginError + índice único no banco).
 */
export async function createNfseDraftFromSaleAction(id: string): Promise<{ error: string } | { draftId: string }> {
  const permissionError = await checkModuleAction("publicidade", "vendas_editar");
  if (permissionError) return { error: permissionError };
  const nfseError = await checkModuleAction("nfse", "rascunhos_criar");
  if (nfseError) return { error: nfseError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const sale = await getCommercialSaleService(client).getById(id);
    const saleClient = await getClientService(client).getById(sale.clientId);

    const draftService = getDraftService(client);
    let draft;
    try {
      draft = await draftService.registerFromOrigin({
        clientId: sale.clientId,
        tomador: buildTomadorSnapshotFromClient(saleClient, clientDisplayName(saleClient)),
        fiscal: {},
        competencyDate: sale.startDate,
        serviceValue: sale.amount,
        serviceDescription: buildCommercialBillingDescription(sale),
        notes: sale.notes,
        originSystem: NFSE_ORIGIN_SYSTEM,
        originType: NFSE_ORIGIN_TYPE,
        originRecordId: sale.id,
        commercialSaleId: sale.id,
      });
    } catch (error) {
      if (error instanceof DraftDuplicateOriginError) return { error: "Já existe um rascunho de NFS-e para esta venda." };
      throw error;
    }

    await recordAuditEventSupabase(client, {
      userId: AUDIT.actorId,
      entityType: ENTITY_TYPE,
      entityId: id,
      action: "create_nfse_draft",
      metadata: { draftId: draft.id },
    });

    revalidatePath(listPath(id));
    revalidatePath("/sistema/nfse/rascunhos");
    return { draftId: draft.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
