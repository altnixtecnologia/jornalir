"use server";

import { getTransmissionService } from "../../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";

type Result = { error: string } | { ok: true; xml: string };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a consulta.";
}

/** Mesmo gate de cancellation-actions.ts — admin/owner ATIVO, revalidado no banco. */
async function requireFiscalAdmin(client: ReturnType<typeof createSupabaseServerClient>): Promise<void> {
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) throw new Error("Faça login novamente.");
  const { data: profile, error } = await client.from("profiles").select("active,role").eq("id", user.user.id).maybeSingle();
  if (error || !profile?.active || (profile.role !== "admin" && profile.role !== "owner")) {
    throw new Error("Somente administradores podem consultar a NFS-e no Sistema Nacional.");
  }
}

/**
 * Consulta da NFS-e pela chave de acesso no Sistema Nacional (Bloco B,
 * item 4 — UI "consultas", 25/10/2026) — chama diretamente
 * `TransmissionService.consultNfseByAccessKey`, que delega ao
 * provider real (`FetchNationalNfseProvider`, ainda bloqueado por
 * `RealTransmissionNotReadyError`, ver national-nfse-provider.ts).
 * Nunca contorna o bloqueio: esta ação só existe pra deixar a
 * interface tecnicamente completa (o botão já chama o caminho real),
 * nunca pra habilitar consulta de verdade antes da hora. Reaproveita a
 * permissão `notas_cancelar` (catálogo existente, admin-only) em vez
 * de criar uma permissão nova — a revisão de permissões/migrations
 * fiscais fica pro item 5, separado deste.
 */
export async function consultNfseByAccessKeyAction(accessKey: string): Promise<Result> {
  const permissionError = await checkModuleAction("nfse", "notas_cancelar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    await requireFiscalAdmin(client);
    const xml = await getTransmissionService(client).consultNfseByAccessKey(accessKey, "homologation");
    return { ok: true, xml };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
