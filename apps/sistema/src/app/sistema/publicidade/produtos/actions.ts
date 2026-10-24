"use server";

import { revalidatePath } from "next/cache";
import type { CommercialChannel } from "@ir/types";
import { getCommercialProductService } from "../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const LIST_PATH = "/sistema/publicidade/produtos";
const ENTITY_TYPE = "commercial_product";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export interface CommercialProductFormInput {
  name: string;
  channel: CommercialChannel;
  description: string;
  suggestedPrice: string;
}

function toServiceInput(input: CommercialProductFormInput) {
  return {
    name: input.name,
    channel: input.channel,
    description: input.description,
    suggestedPrice: input.suggestedPrice.trim() ? Number(input.suggestedPrice) : undefined,
  };
}

export async function createCommercialProductAction(input: CommercialProductFormInput): Promise<ActionResult> {
  const permissionError = await checkModuleAction("publicidade", "produtos_gerenciar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const product = await getCommercialProductService(client).create(toServiceInput(input));
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: product.id, action: "create", metadata: { name: product.name } });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function updateCommercialProductAction(id: string, input: CommercialProductFormInput): Promise<ActionResult> {
  const permissionError = await checkModuleAction("publicidade", "produtos_gerenciar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getCommercialProductService(client).update(id, toServiceInput(input));
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "update" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

/** "Excluir" um produto é sempre desativar — nunca uma remoção real (mesmo princípio dos Perfis de serviço da NFS-e). */
export async function deactivateCommercialProductAction(id: string): Promise<ActionResult> {
  const permissionError = await checkModuleAction("publicidade", "produtos_gerenciar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getCommercialProductService(client).deactivate(id);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "deactivate" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function reactivateCommercialProductAction(id: string): Promise<ActionResult> {
  const permissionError = await checkModuleAction("publicidade", "produtos_gerenciar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getCommercialProductService(client).activate(id);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "reactivate" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}
