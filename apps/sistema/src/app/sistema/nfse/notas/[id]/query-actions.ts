"use server";

import { getTransmissionService } from "../../../../../composition/nfse";
import { prepareRestrictedNfseTransmissionService } from "../../../../../composition/nfse-restricted";
import { isRestrictedSefinEnvironment, restrictedSefinEnvironmentFromServer } from "../../../../../lib/nfse/restrictedSefinGate";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { createIssuedNoteRepositorySupabase } from "../../../../../providers/supabase/nfseIssuedNoteRepository.supabase";
import { isLocalPreviewEnabled } from "../../../../../lib/auth/localPreview";

type Result =
  | { error: string }
  | { ok: true; xml: string; source: "demonstration" | "official" };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a consulta.";
}

/** Mesmo gate de cancelamento: owner/admin ativo, confirmado no banco. */
async function requireFiscalAdmin(client: ReturnType<typeof createSupabaseServerClient>): Promise<void> {
  if (isLocalPreviewEnabled()) return;
  const { data, error } = await client.rpc("is_active_admin_or_owner");
  if (error || data !== true) {
    throw new Error("Somente administradores ou proprietários podem consultar a NFS-e no Sistema Nacional.");
  }
}

/**
 * Somente consulta nota que existe neste sistema, por ID interno.
 * Nunca aceita do navegador uma chave de acesso arbitraria.
 * Em preview devolve APENAS XML local ficticio com origem explicita.
 * Em ambiente real a conexao permanece bloqueada no provider oficial.
 */
export async function consultNfseByNoteIdAction(noteId: string): Promise<Result> {
  const permissionError = await checkModuleAction("nfse", "notas_cancelar");
  if (permissionError) return { error: permissionError };
  try {
    const client = createSupabaseServerClient();
    await requireFiscalAdmin(client);
    const note = await createIssuedNoteRepositorySupabase(client).getById(noteId);
    if (!note) return { error: "NFS-e não encontrada." };

    if (isLocalPreviewEnabled()) {
      return {
        ok: true,
        xml: note.nfseXml || note.signedDpsXml,
        source: "demonstration",
      };
    }
    if (note.environment !== "homologation") {
      return { error: "Consulta fiscal de produção indisponível." };
    }
    if (!note.accessKey) return { error: "Nota sem chave oficial; necessário conciliar a DPS." };
    const restricted = isRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer());
    const service = restricted ? prepareRestrictedNfseTransmissionService(client) : getTransmissionService(client);
    const xml = await service.consultNfseByAccessKey(note.accessKey, note.environment);
    return { ok: true, xml, source: "official" };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
