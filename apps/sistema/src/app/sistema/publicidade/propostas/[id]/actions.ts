"use server";

import { revalidatePath } from "next/cache";
import type { CommercialProposalStatus } from "@ir/types";
import { computeProposalItemTotal, computeProposalTotal } from "@ir/types";
import { getCommercialProductService, getCommercialProposalService, getCommercialSaleService } from "../../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import { toCommercialProposalServiceInput, type CommercialProposalFormInput } from "../commercialProposalFormTypes";

const ENTITY_TYPE = "commercial_proposal";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function listPath(id: string): string {
  return `/sistema/publicidade/propostas/${id}`;
}

export async function updateCommercialProposalAction(id: string, input: CommercialProposalFormInput): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getCommercialProposalService(client).update(id, toCommercialProposalServiceInput(input));
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "update" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(listPath(id));
  revalidatePath("/sistema/publicidade/propostas");
}

export async function changeCommercialProposalStatusAction(id: string, to: CommercialProposalStatus): Promise<{ error: string } | void> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getCommercialProposalService(client).changeStatus(id, to);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "change_status", metadata: { to } });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(listPath(id));
  revalidatePath("/sistema/publicidade/propostas");
}

export async function duplicateCommercialProposalAction(id: string): Promise<{ error: string } | { id: string }> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const copy = await getCommercialProposalService(client).duplicate(id);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: copy.id, action: "duplicate", metadata: { fromId: id } });
    revalidatePath("/sistema/publicidade/propostas");
    return { id: copy.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * "Converter em venda" (Fase 3) — nunca duplica: markConverted() recusa
 * se convertedSaleId já estiver preenchido (checagem no service, antes
 * de qualquer criação). A venda nasce com proposalId preenchido, valor
 * total somado dos itens, condição comercial herdada da proposta.
 * NUNCA gera Financeiro aqui — isso é uma ação separada e explícita na
 * própria venda (Fase 4).
 */
export async function convertCommercialProposalToSaleAction(id: string): Promise<{ error: string } | { saleId: string }> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const proposalService = getCommercialProposalService(client);
    const proposal = await proposalService.getWithItems(id);
    if (proposal.convertedSaleId) return { error: "Esta proposta já foi convertida em venda." };
    if (proposal.status !== "approved") return { error: "Só é possível converter uma proposta aprovada." };

    const total = computeProposalTotal(proposal.items);
    // Uma unica leitura do catalogo: guarda o NOME e a MODALIDADE que
    // existiam ao aprovar a proposta, sem depender de edicoes futuras.
    const products = await getCommercialProductService(client).list();
    const catalog = new Map(products.map((product) => [product.id, product]));
    const itemsSnapshot = proposal.items.map((item) => {
      const product = item.productId ? catalog.get(item.productId) : undefined;
      if (item.productId && !product) {
        throw new Error("Produto da proposta não encontrado no catálogo. Confira o cadastro antes de converter.");
      }
      return {
        sourceProposalItemId: item.id,
        productId: item.productId,
        productName: product?.name ?? item.description,
        serviceChannel: product?.channel ?? ("other" as const),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        totalAmount: computeProposalItemTotal(item),
        sortOrder: item.sortOrder,
      };
    });
    const firstItemWithProduct = proposal.items.length === 1 ? proposal.items[0] : undefined;
    const sale = await getCommercialSaleService(client).register({
      clientId: proposal.clientId,
      proposalId: proposal.id,
      itemsSnapshot,
      productId: firstItemWithProduct?.productId,
      channel: proposal.items.length === 1 ? (itemsSnapshot[0]?.productName ?? "Publicidade") : "Pacote de serviços",
      description: proposal.items.length === 1
        ? itemsSnapshot[0].description
        : `${proposal.items.length} serviços da proposta ${proposal.reference}`,
      startDate: new Date().toISOString().slice(0, 10),
      amount: total,
      commercialCondition: proposal.commercialCondition,
      installmentsCount: 1,
      notes: proposal.notes,
    });

    await proposalService.markConverted(proposal.id, sale.id);

    await recordAuditEventSupabase(client, {
      userId: AUDIT.actorId,
      entityType: ENTITY_TYPE,
      entityId: id,
      action: "convert_to_sale",
      metadata: { saleId: sale.id },
    });

    revalidatePath(listPath(id));
    revalidatePath("/sistema/publicidade/propostas");
    revalidatePath("/sistema/publicidade/vendas");
    return { saleId: sale.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
