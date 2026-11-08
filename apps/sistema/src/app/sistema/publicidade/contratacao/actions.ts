"use server";

import { revalidatePath } from "next/cache";
import { getClientService } from "../../../../composition/clientes";
import { getCommercialProductService, getCommercialProposalService } from "../../../../composition/comercial";
import { getContractTemplateService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import { buildContractTemplatePdf } from "../../../../lib/contracts/contractTemplatePdf";
import { loadContractorProfile } from "../../../../lib/contracts/contractorProfileLoader";
import { buildCompositionDocument, type CompositionRequest } from "../../../../lib/contracts/compositionDocument";
import {
  buildNegotiationRecord,
  computeServiceTotals,
  formatDateBr,
  formatNegotiationNote,
  validateCompositionServices,
  type CompositionServiceInput,
} from "../../../../lib/contracts/contractComposition";

/**
 * Montagem de contratação (Etapa 2 de Contratos, 08/11/2026). Nada aqui
 * assina, envia contrato, cobra, ativa modelo ou grava documento: a MINUTA é
 * gerada na hora (não persistida) com marca visível; "criar proposta" usa o
 * serviço de propostas já existente. Cada ação relevante é auditada.
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
      loadTemplate: async (id) => {
        try {
          return await getContractTemplateService(client).getById(id);
        } catch {
          return null;
        }
      },
      loadProducts: async (ids) => {
        const products = await getCommercialProductService(client).list({ activeOnly: true });
        return products
          .filter((product) => ids.includes(product.id))
          .map((product) => ({ id: product.id, name: product.name, channel: product.channel, suggestedPrice: product.suggestedPrice, active: product.active }));
      },
      loadContractor: (todayIso) => loadContractorProfile(client, todayIso),
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

/**
 * Cria a PROPOSTA comercial com estes itens (serviço de propostas existente;
 * nenhum fluxo paralelo). Preserva o preço de tabela em `unit_price` e o
 * valor negociado como `discount_amount` (o total continua o negociado),
 * guarda o histórico de negociação nas notas internas e na auditoria. Só
 * itens do catálogo; acréscimo acima da tabela não cabe na proposta.
 */
export async function createProposalFromCompositionAction(input: {
  clientId: string;
  services: CompositionServiceInput[];
}): Promise<Failure | { ok: true; id: string; reference: string }> {
  const denied = await checkModuleAction("publicidade", "propostas_criar");
  if (denied) return { error: denied };
  const validation = validateCompositionServices(input.services);
  if (!validation.ok) return { error: validation.errors.join(" ") };
  if (validation.services.some((service) => service.kind !== "catalog")) {
    return { error: "A proposta aceita apenas produtos do catálogo. Remova assinaturas e serviços avulsos ou gere somente a minuta." };
  }
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const ids = [...new Set(validation.services.map((service) => service.productId as string))];
    const catalog = (await getCommercialProductService(client).list({ activeOnly: true })).filter((product) => ids.includes(product.id));
    const byId = new Map(catalog.map((product) => [product.id, product]));

    const services: CompositionServiceInput[] = [];
    for (const [index, service] of validation.services.entries()) {
      const product = byId.get(service.productId as string);
      if (!product) return { error: `Serviço ${index + 1}: produto do catálogo inexistente ou inativo.` };
      services.push({ ...service, channel: product.channel, listUnitPrice: product.suggestedPrice ?? service.listUnitPrice });
    }
    for (const [index, service] of services.entries()) {
      if (computeServiceTotals(service).adjustmentAmount < 0) {
        return { error: `Serviço ${index + 1}: valor acima da tabela não cabe em proposta (desconto negativo). Ajuste o valor ou gere somente a minuta.` };
      }
    }
    const negotiation = buildNegotiationRecord(services);
    const today = new Date().toISOString().slice(0, 10);
    const { profile } = await (async () => {
      const { data } = await client.from("profiles").select("name").eq("id", actor.actorId).maybeSingle();
      return { profile: data as { name?: string } | null };
    })();
    const noteLines = services.map(
      (service, index) => `2.${index + 1} ${service.title}: vigência ${formatDateBr(service.startsOn)} a ${formatDateBr(service.endsOn)}`,
    );
    const proposal = await getCommercialProposalService(client).register({
      clientId: input.clientId,
      proposalDate: today,
      commercialCondition: "other",
      notes: `Montada em "Montagem de contratação". Vigências propostas por serviço:\n${noteLines.join("\n")}`,
      internalNotes: formatNegotiationNote(negotiation, profile?.name ?? "usuário autenticado", new Date().toISOString()) || undefined,
      items: services.map((service) => {
        const totals = computeServiceTotals(service);
        return {
          productId: service.productId,
          description: service.title.slice(0, 200),
          quantity: service.quantity,
          unitPrice: service.listUnitPrice,
          discountAmount: totals.adjustmentAmount,
        };
      }),
    });
    await audit(client, "commercial_proposal", proposal.id, "create", {
      reference: proposal.reference, via: "montagem_de_contratacao", itemCount: services.length,
    });
    if (negotiation.length > 0) {
      await audit(client, "commercial_proposal", proposal.id, "negotiated_values_recorded", {
        context: "proposta", entries: negotiation,
      });
    }
    revalidatePath("/sistema/publicidade/propostas");
    revalidatePath("/sistema/publicidade");
    return { ok: true, id: proposal.id, reference: proposal.reference };
  } catch (error) {
    return { error: toMessage(error) };
  }
}
