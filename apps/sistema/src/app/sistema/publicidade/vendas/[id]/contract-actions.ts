"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";

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
    const { data, error } = await client.from("commercial_contract_packages")
      .update({ document_mode: mode, updated_at: new Date().toISOString() })
      .eq("id", id(packageId)).eq("commercial_sale_id", id(saleId))
      .eq("status", "draft").select("id").maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "A contratação precisa estar em rascunho.");
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
