"use server";

import { revalidatePath } from "next/cache";
import type { ContractTemplate } from "@ir/types";
import { getClientService } from "../../../../composition/clientes";
import { getSubscriptionService } from "../../../../composition/assinaturas";
import { getCommercialProductService, getCommercialProposalService } from "../../../../composition/comercial";
import { getContractService, getContractTemplateService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import { buildContractTemplatePdf } from "../../../../lib/contracts/contractTemplatePdf";
import { loadContractorProfile } from "../../../../lib/contracts/contractorProfileLoader";
import { buildCompositionDocument, type CompositionRequest } from "../../../../lib/contracts/compositionDocument";
import {
  persistContracting,
  type ContractingDeps,
  type ContractingRequest,
  type ContractingOutcome,
} from "../../../../lib/contracts/contractingPersistence";
import type { ContractorRepresentativeOption } from "../../../../lib/contracts/contractorProfile";

/**
 * Montagem de contratação (Etapa 2 de Contratos, 08/11/2026). A MINUTA é gerada
 * na hora (não persistida) com marca visível. "Criar contratação" persiste nos
 * cadastros existentes (proposta, assinatura pendente de formalização,
 * contrato institucional) de forma idempotente. Nada aqui assina, envia
 * contrato, cobra ou ativa modelo/serviço. Cada ação relevante é auditada.
 */

type Failure = { error: string };

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

async function permissionFor(modality: "commercial" | "institutional"): Promise<string | null> {
  return modality === "institutional"
    ? checkFinanceAction("contratos_criar")
    : checkModuleAction("publicidade", "contratos_preparar");
}

/** Auditoria é melhor esforço: a ação principal já ocorreu; falha ao registrar nunca desfaz nem trava. */
async function audit(
  client: ReturnType<typeof createSupabaseServerClient>,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const actor = await getAuditContext(client);
    await recordAuditEventSupabase(client, { userId: actor.actorId, entityType, entityId, action, metadata });
  } catch (error) {
    console.error("Falha ao registrar auditoria da contratação:", error instanceof Error ? error.message : error);
  }
}

async function loadProductsFor(client: ReturnType<typeof createSupabaseServerClient>, ids: string[]) {
  const products = await getCommercialProductService(client).list({ activeOnly: true });
  return products
    .filter((product) => ids.includes(product.id))
    .map((product) => ({ id: product.id, name: product.name, channel: product.channel, suggestedPrice: product.suggestedPrice, active: product.active }));
}

async function loadTemplateFor(client: ReturnType<typeof createSupabaseServerClient>, id: string): Promise<ContractTemplate | null> {
  try {
    return await getContractTemplateService(client).getById(id);
  } catch {
    return null;
  }
}

export interface CompositionPdfResponse {
  ok: true;
  pdfBase64: string;
  fileName: string;
  marking: string;
  stage: "test" | "production";
  pendencies: string[];
  notices: string[];
  contractorConfigured: boolean;
  sha256: string;
  totals: { listTotal: number; negotiatedTotal: number; adjustmentAmount: number };
}

/** Gera a MINUTA (PDF) — não persiste, não ativa modelo, não assina. */
export async function generateCompositionPdfAction(request: CompositionRequest): Promise<Failure | CompositionPdfResponse> {
  if (request.modality !== "commercial" && request.modality !== "institutional") return { error: "Modalidade inválida." };
  const denied = await permissionFor(request.modality);
  if (denied) return { error: denied };
  try {
    const client = createSupabaseServerClient();
    const result = await buildCompositionDocument(request, {
      loadClient: async (id) => {
        try {
          return await getClientService(client).getById(id);
        } catch {
          return null;
        }
      },
      loadTemplate: (id) => loadTemplateFor(client, id),
      loadProducts: (ids) => loadProductsFor(client, ids),
      loadContractor: (todayIso, representativeId) => loadContractorProfile(client, todayIso, representativeId),
      canNegotiateValues: async () => (await checkModuleAction("publicidade", "valores_negociar")) === null,
      buildPdf: buildContractTemplatePdf,
      now: () => new Date(),
    });
    if (!result.ok) return { error: result.error };

    await audit(client, "client", request.clientId, "contract_draft_generated", {
      modality: request.modality,
      stage: result.stage,
      marking: result.marking,
      templateId: result.template.id,
      templateGroupId: result.template.groupId,
      templateVersion: result.template.version,
      templateTitle: result.template.title,
      representativeId: request.representativeId ?? null,
      services: result.services.map((service) => ({
        title: service.title, kind: service.kind, channel: service.channel, quantity: service.quantity,
        listUnitPrice: service.listUnitPrice, negotiatedUnitPrice: service.negotiatedUnitPrice,
        startsOn: service.startsOn, endsOn: service.endsOn, periodicity: service.periodicity,
      })),
      totals: result.totals,
      pendencyCount: result.pendencies.length,
      contractorConfigured: result.contractorConfigured,
      pdfSha256: result.sha256,
      persisted: false,
    });
    if (result.negotiation.length > 0) {
      await audit(client, "client", request.clientId, "negotiated_values_recorded", {
        context: "minuta", templateId: result.template.id, entries: result.negotiation,
      });
    }

    return {
      ok: true,
      pdfBase64: Buffer.from(result.pdf).toString("base64"),
      fileName: result.fileName,
      marking: result.marking,
      stage: result.stage,
      pendencies: result.pendencies,
      notices: result.notices,
      contractorConfigured: result.contractorConfigured,
      sha256: result.sha256,
      totals: result.totals,
    };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

/** Representantes ATIVOS da contratada com a situação de vigência — para o operador escolher quem assina. */
export async function listContractorRepresentativesAction(): Promise<
  Failure | { ok: true; configured: boolean; representatives: ContractorRepresentativeOption[] }
> {
  const [commercialDenied, institutionalDenied] = await Promise.all([
    checkModuleAction("publicidade", "contratos_preparar"),
    checkFinanceAction("contratos_criar"),
  ]);
  if (commercialDenied && institutionalDenied) return { error: commercialDenied };
  try {
    const client = createSupabaseServerClient();
    const profile = await loadContractorProfile(client, new Date().toISOString().slice(0, 10));
    return { ok: true, configured: profile.configured, representatives: profile.representatives };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

export type ContractingResponse = ({ ok: true } & ContractingOutcome) | ({ ok: false; error: string } & Partial<ContractingOutcome>);

/**
 * "Criar contratação": persiste os serviços nos cadastros existentes
 * (proposta comercial, assinatura PENDENTE DE FORMALIZAÇÃO, contrato
 * institucional), vincula o modelo em PRODUÇÃO e o representante escolhido,
 * registra o histórico de negociação. Idempotente por `requestId`. Nunca
 * ativa assinatura, gera título/cobrança, gera/assina documento ou envia nada.
 */
export async function createContractingFromCompositionAction(request: ContractingRequest): Promise<ContractingResponse> {
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const deps: ContractingDeps = {
      checkPermission: (kind) => {
        if (kind === "proposal") return checkModuleAction("publicidade", "propostas_criar");
        if (kind === "subscription") return checkModuleAction("assinaturas", "assinaturas_criar");
        if (kind === "negotiate") return checkModuleAction("publicidade", "valores_negociar");
        return checkFinanceAction("contratos_criar");
      },
      loadProducts: (ids) => loadProductsFor(client, ids),
      loadTemplate: (id) => loadTemplateFor(client, id),
      loadContractor: (todayIso, representativeId) => loadContractorProfile(client, todayIso, representativeId),
      actorName: async () => {
        const { data } = await client.from("profiles").select("name").eq("id", actor.actorId).maybeSingle();
        return (data as { name?: string } | null)?.name ?? "usuário autenticado";
      },
      findProposal: async (requestId) => {
        const { data, error } = await client.from("commercial_proposals").select("id, internal_reference").eq("composition_request_id", requestId).maybeSingle();
        if (error) throw new Error("Não foi possível conferir se a proposta já existe.");
        return data ? { id: data.id as string, reference: data.internal_reference as string } : null;
      },
      createProposal: async (input) => {
        const proposal = await getCommercialProposalService(client).register({
          clientId: input.clientId,
          proposalDate: new Date().toISOString().slice(0, 10),
          commercialCondition: "other",
          notes: input.notes,
          internalNotes: input.internalNotes,
          contractTemplateId: input.contractTemplateId,
          contractModality: input.contractModality,
          contractorRepresentativeId: input.contractorRepresentativeId,
          compositionRequestId: input.requestId,
          items: input.items,
        });
        return { id: proposal.id, reference: proposal.reference };
      },
      findSubscription: async (requestId, itemIndex) => {
        const { data, error } = await client.from("subscriptions").select("id, internal_reference").eq("composition_request_id", requestId).eq("composition_item_index", itemIndex).limit(1).maybeSingle();
        if (error) throw new Error("Não foi possível conferir se a assinatura já existe.");
        return data ? { id: data.id as string, reference: data.internal_reference as string } : null;
      },
      createSubscription: async (input) => {
        // Sem `status`: nasce "pendente de formalização" (nunca ativa, nunca gera título).
        const subscription = await getSubscriptionService(client).register({
          clientId: input.clientId,
          serviceType: input.serviceType,
          amount: input.amount,
          periodicity: input.periodicity,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          print: input.serviceType === "impresso" && input.copies ? { copies: input.copies } : undefined,
          notes: input.notes,
          compositionRequestId: input.requestId,
          compositionItemIndex: input.itemIndex,
        });
        return { id: subscription.id, reference: subscription.reference };
      },
      findContract: async (requestId) => {
        const { data, error } = await client.from("institutional_contracts").select("id, internal_reference").eq("extra_data->>compositionRequestId", requestId).limit(1).maybeSingle();
        if (error) throw new Error("Não foi possível conferir se o contrato já existe.");
        return data ? { id: data.id as string, reference: data.internal_reference as string } : null;
      },
      createContract: async (input) => {
        const contract = await getContractService(client).register({
          clientId: input.clientId,
          object: input.object,
          contractedAmount: input.contractedAmount,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          notes: input.notes,
          extraData: input.extraData,
        });
        return { id: contract.id, reference: contract.reference };
      },
      audit: (entityType, entityId, action, metadata) => audit(client, entityType, entityId, action, metadata),
      now: () => new Date(),
    };

    const result = await persistContracting(request, deps);
    if (result.ok) {
      revalidatePath("/sistema/publicidade/propostas");
      revalidatePath("/sistema/publicidade");
      revalidatePath("/sistema/assinaturas");
      revalidatePath("/sistema/financeiro/contratos");
    }
    return result;
  } catch (error) {
    return { ok: false, error: toMessage(error), subscriptions: [], notices: [], negotiation: [] };
  }
}
