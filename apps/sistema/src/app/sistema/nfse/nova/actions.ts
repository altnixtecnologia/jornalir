"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClientKind } from "@ir/types";
import { buildTomadorSnapshotFromClient, clientDisplayName } from "@ir/types";
import { getDraftService } from "../../../../composition/nfse";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const LIST_PATH = "/sistema/nfse/rascunhos";
const ENTITY_TYPE = "nfse_draft";

type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export interface TomadorSnapshotFormInput {
  kind: ClientKind;
  name: string;
  cpf: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  ibgeCode: string;
  email: string;
  phone: string;
}

export interface FiscalSnapshotFormInput {
  cTribNac: string;
  cTribMun: string;
  cNBS: string;
  issqnTaxation: string;
  specialTaxRegime: string;
  locationMunicipality: string;
  locationIbgeCode: string;
}

export interface DraftFormInput {
  clientId: string;
  tomador: TomadorSnapshotFormInput;
  serviceProfileId: string;
  fiscal: FiscalSnapshotFormInput;
  competencyDate: string;
  serviceValue: string;
  serviceDescription: string;
  notes: string;
}

function parseValue(value: string): number {
  return Number(value.replace(",", "."));
}

function toServiceInput(input: DraftFormInput) {
  return {
    clientId: input.clientId,
    tomador: {
      sourceClientId: input.clientId,
      kind: input.tomador.kind,
      name: input.tomador.name,
      cpf: input.tomador.cpf || undefined,
      cnpj: input.tomador.cnpj || undefined,
      municipalRegistration: input.tomador.municipalRegistration || undefined,
      stateRegistration: input.tomador.stateRegistration || undefined,
      zip: input.tomador.zip || undefined,
      street: input.tomador.street || undefined,
      number: input.tomador.number || undefined,
      complement: input.tomador.complement || undefined,
      neighborhood: input.tomador.neighborhood || undefined,
      city: input.tomador.city || undefined,
      state: input.tomador.state || undefined,
      ibgeCode: input.tomador.ibgeCode || undefined,
      email: input.tomador.email || undefined,
      phone: input.tomador.phone || undefined,
    },
    serviceProfileId: input.serviceProfileId || undefined,
    fiscal: {
      sourceServiceProfileId: input.serviceProfileId || undefined,
      cTribNac: input.fiscal.cTribNac || undefined,
      cTribMun: input.fiscal.cTribMun || undefined,
      cNBS: input.fiscal.cNBS || undefined,
      issqnTaxation: input.fiscal.issqnTaxation || undefined,
      specialTaxRegime: input.fiscal.specialTaxRegime || undefined,
      locationMunicipality: input.fiscal.locationMunicipality || undefined,
      locationIbgeCode: input.fiscal.locationIbgeCode || undefined,
    },
    competencyDate: input.competencyDate,
    serviceValue: parseValue(input.serviceValue),
    serviceDescription: input.serviceDescription,
    notes: input.notes || undefined,
  };
}

export async function createDraftAction(input: DraftFormInput): Promise<{ error: string } | { ok: true; draftId: string }> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    const draft = await getDraftService(client).register(toServiceInput(input));
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: draft.id, action: "create", metadata: { clientId: draft.clientId } });
    revalidatePath(LIST_PATH);
    return { ok: true, draftId: draft.id };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateDraftAction(id: string, input: DraftFormInput): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const AUDIT = await getAuditContext(client);
    await getDraftService(client).update(id, toServiceInput(input));
    await recordAuditEventSupabase(client, { userId: AUDIT.actorId, entityType: ENTITY_TYPE, entityId: id, action: "update" });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  redirect(`${LIST_PATH}/${id}`);
}

/**
 * "Atualizar dados do cliente" (ajuste pós-revisão, item 1) — a ÚNICA
 * forma de mudar o snapshot do tomador num rascunho: recarrega do
 * cadastro mestre AGORA, sob ação explícita. O rascunho NUNCA muda
 * silenciosamente só porque o cliente foi editado depois (snapshot
 * continua obrigatório) — e esta ação nunca escreve de volta em
 * `clients` (isso foi removido; dados do tomador agora são somente
 * leitura na tela de NFS-e — use "Editar cliente" para corrigir o
 * cadastro mestre).
 */
export async function refreshTomadorSnapshotAction(
  clientId: string,
  draftId?: string,
): Promise<{ error: string } | { ok: true; tomador: TomadorSnapshotFormInput }> {
  try {
    const client = createSupabaseServerClient();
    const current = await getClientService(client).getById(clientId);
    const snapshot = buildTomadorSnapshotFromClient(current, clientDisplayName(current));
    // Só audita quando já existe um rascunho real (edição) — na criação
    // ainda não há entidade pra anexar o evento; a criação do rascunho
    // em si já audita a origem (clientId).
    if (draftId) {
      const AUDIT = await getAuditContext(client);
      await recordAuditEventSupabase(client, {
        userId: AUDIT.actorId,
        entityType: ENTITY_TYPE,
        entityId: draftId,
        action: "refresh_snapshot_from_client",
        metadata: { clientId },
      });
    }
    return {
      ok: true,
      tomador: {
        kind: snapshot.kind,
        name: snapshot.name,
        cpf: snapshot.cpf ?? "",
        cnpj: snapshot.cnpj ?? "",
        municipalRegistration: snapshot.municipalRegistration ?? "",
        stateRegistration: snapshot.stateRegistration ?? "",
        zip: snapshot.zip ?? "",
        street: snapshot.street ?? "",
        number: snapshot.number ?? "",
        complement: snapshot.complement ?? "",
        neighborhood: snapshot.neighborhood ?? "",
        city: snapshot.city ?? "",
        state: snapshot.state ?? "",
        ibgeCode: snapshot.ibgeCode ?? "",
        email: snapshot.email ?? "",
        phone: snapshot.phone ?? "",
      },
    };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
