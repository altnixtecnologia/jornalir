"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import { getClientService } from "../../../../../composition/clientes";
import { getCommercialSaleService } from "../../../../../composition/comercial";
import { clientDisplayName } from "@ir/types";
import { qualifyCommercialClient } from "../../../../../lib/contracts/commercialQualification";
import { renderCommercialLegalDraft } from "../../../../../lib/contracts/commercialLegalDraft";
import { commercialDocumentAmount } from "../../../../../lib/contracts/commercialDocumentAmount";
import {
  buildCommercialContractPreview, type CommercialPreviewResult,
  type CommercialServiceForPreview,
} from "../../../../../lib/contracts/commercialContractPreview";

type ActionResult = { error: string } | { ok: true; packageId: string };
const SALES_PATH = "/sistema/publicidade/vendas";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(value: string): string {
  if (!uuidPattern.test(value)) throw new Error("Identificador inválido.");
  return value;
}
function toText(value: string, limit = 2000): string | null {
  const clean = value.trim();
  if (clean.length > limit) throw new Error("Texto excede o máximo de " + limit + " caracteres.");
  return clean || null;
}
function date(value: string): string | null {
  const clean = value.trim();
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(clean + "T12:00:00Z"))) {
    throw new Error("Data inválida. Informe ano, mês e dia.");
  }
  if (new Date(clean + "T12:00:00Z").toISOString().slice(0, 10) !== clean) {
    throw new Error("A data não existe no calendário.");
  }
  return clean;
}
function errorOf(error: unknown): ActionResult {
  return { error: error instanceof Error ? error.message : "Não foi possível salvar o documento." };
}
function updateSalePage(saleId: string): void {
  revalidatePath(SALES_PATH + "/" + saleId);
}

export async function prepareCommercialContractAction(
  saleId: string,
  mode: "combined" | "separate",
): Promise<ActionResult> {
  const denied = await checkModuleAction("publicidade", "contratos_preparar");
  if (denied) return { error: denied };
  try {
    if (mode !== "combined" && mode !== "separate") throw new Error("Agrupamento inválido.");
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data, error } = await client.rpc("prepare_commercial_contract", {
      p_sale_id: id(saleId), p_document_mode: mode,
    });
    if (error || typeof data !== "string") throw new Error(error?.message ?? "Erro ao preparar contratação.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "commercial_contract_package",
      entityId: data, action: "prepare", metadata: { saleId, mode },
    });
    updateSalePage(saleId);
    return { ok: true, packageId: data };
  } catch (error) { return errorOf(error); }
}

export async function setCommercialContractModeAction(
  packageId: string, saleId: string, mode: "combined" | "separate",
): Promise<ActionResult> {
  const denied = await checkModuleAction("publicidade", "contratos_preparar");
  if (denied) return { error: denied };
  try {
    if (mode !== "combined" && mode !== "separate") throw new Error("Agrupamento inválido.");
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data: current, error: currentError } = await client.from("commercial_contract_packages")
      .select("id").eq("id", id(packageId)).eq("commercial_sale_id", id(saleId))
      .eq("status", "draft").maybeSingle();
    if (currentError || !current) throw new Error(currentError?.message ?? "A contratação precisa estar em rascunho.");
    const { error } = await client.rpc("set_commercial_contract_document_mode", {
      p_package_id: current.id, p_mode: mode,
    });
    if (error) throw new Error("Não foi possível atualizar a documentação automática: " + error.message);
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "commercial_contract_package",
      entityId: packageId, action: "set_document_mode", metadata: { mode },
    });
    updateSalePage(saleId);
    return { ok: true, packageId };
  } catch (error) { return errorOf(error); }
}

export interface CommercialContractTermsInput {
  serviceId: string;
  startsOn: string;
  endsOn: string;
  location: string;
  scope: string;
  executionConditions: string;
}
export async function updateCommercialContractTermsAction(
  packageId: string, saleId: string, input: CommercialContractTermsInput,
): Promise<ActionResult> {
  const denied = await checkModuleAction("publicidade", "contratos_preparar");
  if (denied) return { error: denied };
  try {
    const startsOn = date(input.startsOn), endsOn = date(input.endsOn);
    if (startsOn && endsOn && endsOn < startsOn) {
      throw new Error("O fim da prestação não pode ser anterior ao início.");
    }
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data: pkg, error: pkgError } = await client.from("commercial_contract_packages")
      .select("id").eq("id", id(packageId)).eq("commercial_sale_id", id(saleId))
      .eq("status", "draft").maybeSingle();
    if (pkgError || !pkg) throw new Error(pkgError?.message ?? "Contratação não encontrada ou fechada para revisão.");
    const { data, error } = await client.from("commercial_contract_services")
      .update({
        starts_on: startsOn, ends_on: endsOn,
        service_location: toText(input.location, 500),
        service_scope: toText(input.scope, 4000),
        execution_conditions: toText(input.executionConditions, 4000),
        updated_at: new Date().toISOString(),
      }).eq("id", id(input.serviceId)).eq("package_id", pkg.id)
      .select("id").maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Serviço não encontrado ou sem autorização.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "commercial_contract_service",
      entityId: input.serviceId, action: "update_terms",
      metadata: { packageId, saleId, startsOn, endsOn },
    });
    updateSalePage(saleId);
    return { ok: true, packageId };
  } catch (error) { return errorOf(error); }
}

export async function reviewCommercialContractAction(
  packageId: string, saleId: string, to: "pending_legal_review" | "draft",
): Promise<ActionResult> {
  const denied = await checkModuleAction("publicidade", "contratos_revisar");
  if (denied) return { error: denied };
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    if (to === "pending_legal_review") {
      const { data: pkg, error: pkgError } = await client.from("commercial_contract_packages")
        .select("id,client_id,document_mode").eq("id", id(packageId))
        .eq("commercial_sale_id", id(saleId)).eq("status", "draft").maybeSingle();
      if (pkgError || !pkg) throw new Error(pkgError?.message ?? "Contratação indisponível para revisão.");
      const { data: items, error: itemsError } = await client.from("commercial_contract_services")
        .select("id,item_ordinal,service_title,service_channel,source_snapshot,starts_on,ends_on,service_location,service_scope,execution_conditions")
        .eq("package_id", pkg.id).order("item_ordinal");
      if (itemsError) throw new Error(itemsError.message);
      const [sale, customer] = await Promise.all([
        getCommercialSaleService(client).getById(saleId),
        getClientService(client).getById(pkg.client_id),
      ]);
      if (sale.clientId !== pkg.client_id) throw new Error("Cliente divergente na contratação.");
      const qualification = qualifyCommercialClient(customer);
      const preview = buildCommercialContractPreview({
        reference: sale.reference, clientName: clientDisplayName(customer),
        amount: sale.amount, mode: pkg.document_mode as "combined" | "separate",
        services: (items ?? []) as CommercialServiceForPreview[],
      });
      const missing = [...qualification.missing, ...preview.missing];
      if (missing.length) throw new Error("Corrija antes de encaminhar à revisão: " + missing.join("; "));
      // Conferir TODOS os documentos e variáveis antes da transição.
      // O trigger do banco também exige vínculos, mas não valida valores
      // textuais preenchidos no modelo. Nada aqui aprova cláusulas.
      const { data: bindings, error: bindingError } = await client
        .from("commercial_contract_template_assignments")
        .select("service_id,template_id,custom_values").eq("package_id", pkg.id);
      if (bindingError) throw new Error(bindingError.message);
      const docs = pkg.document_mode === "combined"
        ? [{ index: 0, serviceId: null as string | null, channel: "combined", price: commercialDocumentAmount("combined",sale.amount) }]
        : (items ?? []).map((item, index) => ({
            index, serviceId: item.id as string, channel: item.service_channel as string,
            price: commercialDocumentAmount("separate",sale.amount,item.source_snapshot),
          }));
      const selected = docs.map(slot => ({
        ...slot, binding: (bindings ?? []).find(row => row.service_id === slot.serviceId),
      }));
      if (selected.some(slot => !slot.binding) || (bindings ?? []).length !== docs.length) {
        throw new Error("Selecione um modelo jurídico para cada documento antes da revisão.");
      }
      const templateIds = [...new Set(selected.map(slot => slot.binding!.template_id))];
      const { data: modelRows, error: modelError } = await client.from("contract_templates")
        .select("id,title,group_id,version,category,active,content,variables").in("id", templateIds);
      if (modelError || (modelRows ?? []).length !== templateIds.length) {
        throw new Error(modelError?.message ?? "Um modelo jurídico não está disponível.");
      }
      const models = new Map((modelRows ?? []).map(model => [model.id, model]));
      const groupIds = [...new Set((modelRows ?? []).map(model => model.group_id))];
      const { data: versions, error: versionError } = await client.from("contract_templates")
        .select("group_id,version").in("group_id", groupIds);
      if (versionError) throw new Error("Falha ao conferir a versão jurídica: " + versionError.message);
      for (const slot of selected) {
        const model = models.get(slot.binding!.template_id);
        if (!model || !model.active ||
          (versions ?? []).some(version => version.group_id === model.group_id && version.version > model.version)) {
          throw new Error("Modelo jurídico inativo ou substituído. Retorne ao rascunho e revise a seleção.");
        }
        const category = String(model.category ?? "").trim().toLowerCase();
        const expected = "commercial_" + slot.channel.trim().toLowerCase();
        if (category !== expected && !(pkg.document_mode === "separate" && category === "commercial_generic")) {
          throw new Error("Modelo jurídico incompatível com a modalidade " + slot.channel + ".");
        }
        const draft = renderCommercialLegalDraft({
          templateText: model.content,
          reference: sale.reference,
          clientName: qualification.variables["cliente.nome"],
          totalPrice: slot.price.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
          document: preview.documents[slot.index],
          qualification: qualification.variables,
          values: (slot.binding!.custom_values ?? {}) as Record<string,string>,
          requiredVariables: Array.isArray(model.variables)
            ? model.variables as Array<{key:string;label:string;required:boolean}> : [],
        });
        if (draft.missing.length) {
          throw new Error("Modelo " + model.title + ": preencha " + draft.missing.join(", ") + ".");
        }
      }
    }
    const { data, error } = await client.from("commercial_contract_packages")
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq("id", id(packageId)).eq("commercial_sale_id", id(saleId))
      .select("id").maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Não foi possível mudar a etapa de revisão.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "commercial_contract_package",
      entityId: packageId, action: "change_review_status", metadata: { status: to, saleId },
    });
    updateSalePage(saleId);
    return { ok: true, packageId };
  } catch (error) { return errorOf(error); }
}

/** Não grava documentos, não chama PDF ou assinador; somente retorna conferência. */
export async function previewCommercialContractAction(
  packageId: string, saleId: string,
): Promise<{ ok: true; preview: CommercialPreviewResult } | { error: string }> {
  const [prepareDenied, reviewDenied] = await Promise.all([
    checkModuleAction("publicidade", "contratos_preparar"),
    checkModuleAction("publicidade", "contratos_revisar"),
  ]);
  if (prepareDenied && reviewDenied) return { error: "Sem permissão para conferir documentos comerciais." };
  try {
    const client = createSupabaseServerClient();
    const { data: pkg, error: pkgError } = await client.from("commercial_contract_packages")
      .select("id,commercial_sale_id,client_id,document_mode")
      .eq("id", id(packageId)).eq("commercial_sale_id", id(saleId)).maybeSingle();
    if (pkgError || !pkg) throw new Error(pkgError?.message ?? "Contratação não encontrada.");
    const { data: services, error: listError } = await client.from("commercial_contract_services")
      .select("item_ordinal,service_title,service_channel,source_snapshot,starts_on,ends_on,service_location,service_scope,execution_conditions")
      .eq("package_id",pkg.id).order("item_ordinal");
    if (listError) throw new Error(listError.message);
    const [sale, customer] = await Promise.all([
      getCommercialSaleService(client).getById(saleId),
      getClientService(client).getById(pkg.client_id),
    ]);
    if (sale.clientId !== pkg.client_id) throw new Error("Cliente da contratação não corresponde à venda.");
    const preview = buildCommercialContractPreview({
      reference: sale.reference, clientName: clientDisplayName(customer),
      amount: sale.amount, mode: pkg.document_mode as "combined" | "separate",
      services: (services ?? []) as CommercialServiceForPreview[],
    });
    return { ok: true, preview: {
      ...preview, missing: [...preview.missing, ...qualifyCommercialClient(customer).missing],
    } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro ao conferir contratação." }; }
}

/**
 * Escolha explícita de modelo jurídico versionado para pacote inteiro
 * ou para o serviço individual. Não equivale à aprovação jurídica.
 */
export async function saveCommercialContractTemplateAction(
  packageId: string, saleId: string, serviceId: string | null, templateId: string | null,
  customValues: Record<string,string> = {},
): Promise<ActionResult> {
  const denied = await checkModuleAction("publicidade", "contratos_preparar");
  if (denied) return { error: denied };
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data: pkg, error: pkgError } = await client.from("commercial_contract_packages")
      .select("id,document_mode").eq("id", id(packageId))
      .eq("commercial_sale_id", id(saleId)).eq("status", "draft").maybeSingle();
    if (pkgError || !pkg) throw new Error(pkgError?.message ?? "Contratação fechada ou inexistente.");
    if (pkg.document_mode === "combined" && serviceId !== null)
      throw new Error("Contrato único não recebe modelos por serviço.");
    if (pkg.document_mode === "separate" && serviceId === null)
      throw new Error("Selecione um serviço para atribuir o modelo individual.");

    let query = client.from("commercial_contract_template_assignments")
      .select("id").eq("package_id", pkg.id);
    query = serviceId === null ? query.is("service_id", null) : query.eq("service_id", id(serviceId));
    const { data: current, error: lookupError } = await query.maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    if (templateId) {
      const value = id(templateId);
      const { data: template, error: templateError } = await client.from("contract_templates")
        .select("variables").eq("id",value).maybeSingle();
      if (templateError || !template) throw new Error("Modelo jurídico não está disponível.");
      const keys = new Set(
        (Array.isArray(template.variables) ? template.variables : [])
          .map(v => typeof v?.key === "string" ? v.key : "").filter(Boolean)
      );
      const variables: Record<string,string> = {};
      if (Object.keys(customValues).length > 50) throw new Error("Há campos personalizados demais.");
      for (const [key, raw] of Object.entries(customValues)) {
        if (!keys.has(key) || !/^[a-zA-Z0-9_.-]{1,120}$/.test(key) ||
            typeof raw !== "string" || raw.length > 2000) {
          throw new Error("Um dos campos personalizados do modelo é inválido.");
        }
        variables[key] = raw.trim();
      }
      if (JSON.stringify(variables).length > 12000) throw new Error("Dados do modelo muito extensos.");
      if (current) {
        const { data, error } = await client.from("commercial_contract_template_assignments")
          .update({ template_id: value, custom_values: variables, updated_at: new Date().toISOString() })
          .eq("id", current.id).select("id").maybeSingle();
        if (error || !data) throw new Error(error?.message ?? "Vínculo de modelo não atualizado.");
      } else {
        const { data, error } = await client.from("commercial_contract_template_assignments")
          .insert({ package_id: pkg.id, service_id: serviceId ? id(serviceId) : null,
            template_id: value, custom_values: variables, assigned_by: actor.actorId }).select("id").maybeSingle();
        if (error || !data) throw new Error(error?.message ?? "Modelo não vinculado.");
      }
    } else if (current) {
      const { error } = await client.from("commercial_contract_template_assignments")
        .delete().eq("id", current.id);
      if (error) throw new Error(error.message);
    }
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "commercial_contract_package", entityId: pkg.id,
      action: "set_template", metadata: { saleId, serviceId, templateId },
    });
    updateSalePage(saleId);
    return { ok: true, packageId };
  } catch (error) { return errorOf(error); }
}
