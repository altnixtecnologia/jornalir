"use server";

import { revalidatePath } from "next/cache";
import type { NfseCancellationRequest } from "@ir/types";
import {
  CancellationAlreadyRequestedError, CancellationPermissionError,
  InvalidCancellationJustificationError, IssuedNoteNotFoundError,
} from "@ir/core";
import { getCancellationService } from "../../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";

type Result<T = never> = { error: string } | ({ ok: true } & T);

/** Mesmo gate de certificado-actions.ts/parametrizacao-actions.ts — admin/owner ATIVO, revalidado no banco. */
async function requireFiscalAdmin(client: ReturnType<typeof createSupabaseServerClient>): Promise<string> {
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) throw new Error("Faça login novamente.");
  const { data: profile, error } = await client.from("profiles").select("active,role").eq("id", user.user.id).maybeSingle();
  if (error || !profile?.active || (profile.role !== "admin" && profile.role !== "owner")) {
    throw new Error("Somente administradores podem solicitar cancelamento de NFS-e.");
  }
  return user.user.id;
}

export async function listCancellationHistoryAction(issuedNoteId: string): Promise<Result<{ requests: NfseCancellationRequest[] }>> {
  const permissionError = await checkModuleAction("nfse", "notas_cancelar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    await requireFiscalAdmin(client);
    const requests = await getCancellationService(client).listHistory(issuedNoteId);
    return { ok: true, requests };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível carregar o histórico de cancelamento." };
  }
}

export async function requestCancellationAction(input: {
  issuedNoteId: string;
  justificationCode: 1 | 2 | 9;
  justificationText: string;
}): Promise<Result<{ request: NfseCancellationRequest }>> {
  const permissionError = await checkModuleAction("nfse", "notas_cancelar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    const actorId = await requireFiscalAdmin(client);
    const request = await getCancellationService(client).requestCancellation({
      issuedNoteId: input.issuedNoteId,
      justificationCode: input.justificationCode,
      justificationText: input.justificationText,
      isAdminOrOwner: true,
      actorProfileId: actorId,
    });
    revalidatePath("/sistema/nfse/notas/" + input.issuedNoteId);
    return { ok: true, request };
  } catch (error) {
    if (error instanceof CancellationPermissionError) return { error: error.message };
    if (error instanceof IssuedNoteNotFoundError) return { error: error.message };
    if (error instanceof InvalidCancellationJustificationError) return { error: error.message };
    if (error instanceof CancellationAlreadyRequestedError) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Não foi possível registrar a solicitação de cancelamento." };
  }
}
