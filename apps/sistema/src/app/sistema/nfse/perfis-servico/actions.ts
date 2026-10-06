"use server";

import { revalidatePath } from "next/cache";
import { getServiceProfileService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const LIST_PATH = "/sistema/nfse/perfis-servico";
const ENTITY_TYPE = "nfse_service_profile";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export interface ServiceProfileFormInput {
  name: string;
  cTribNac: string;
  cTribMun: string;
  cNBS: string;
  defaultLocationMunicipality: string;
  defaultLocationIbgeCode: string;
  issqnTaxation: string;
  specialTaxRegime: string;
  notes: string;
}

export async function createServiceProfileAction(input: ServiceProfileFormInput): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const profile = await getServiceProfileService(client).register(input);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: profile.id, action: "create", metadata: { name: profile.name } });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function updateServiceProfileAction(id: string, input: ServiceProfileFormInput): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getServiceProfileService(client).update(id, input);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "update" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

/** "Excluir" um perfil é sempre desativar (item 5) — nunca uma remoção real. */
export async function deactivateServiceProfileAction(id: string): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getServiceProfileService(client).deactivate(id);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "deactivate" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}

export async function reactivateServiceProfileAction(id: string): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getServiceProfileService(client).reactivate(id);
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "reactivate" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
}
