import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuditContext } from "./getAuditContext";

/**
 * Exige que quem chama seja administrador ou proprietário ATIVO (papel real
 * lido do banco na sessão — nunca valor vindo do navegador). Devolve o id
 * do ator ou uma mensagem de erro. O banco repete a regra (RLS/RPC); este
 * guard evita chegar lá e dá mensagem clara.
 */
export async function requireAdminOrOwner(
  client: SupabaseClient,
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  try {
    const audit = await getAuditContext(client);
    // getAuditContext mapeia owner/admin → "admin" e operator → "editorial".
    if (audit.actorRole !== "admin") {
      return { ok: false, error: "Somente administrador ou proprietário pode realizar esta ação." };
    }
    return { ok: true, actorId: audit.actorId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sessão inválida. Faça login novamente." };
  }
}
