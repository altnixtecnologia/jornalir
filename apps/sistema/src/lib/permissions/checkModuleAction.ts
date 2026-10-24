import "server-only";
import type { StaffActionModule, StaffModuleActionKey } from "./staffPermissionsCatalog";
import { STAFF_MODULE_ACTIONS } from "./staffPermissionsCatalog";
import { createSupabaseServerClient } from "../supabase/server";
import { NFSE_AVAILABLE_IN_THIS_RELEASE, NFSE_POSTPONED_MESSAGE } from "../release/releasePolicy";

/** A Server Action nao pode confiar apenas nos checkboxes do painel.
 * Financeiro possui verificador proprio; Agenda/Pauta possuem regra propria.
 */
export async function checkModuleAction(
  module: StaffActionModule, action: StaffModuleActionKey,
): Promise<string | null> {
  // NFS-e adiada: nenhuma Server Action recebe permissão, mesmo admin/owner.
  if (module === "nfse" && !NFSE_AVAILABLE_IN_THIS_RELEASE) return NFSE_POSTPONED_MESSAGE;
  if (!STAFF_MODULE_ACTIONS.some((item) => item.module === module && item.key === action)) {
    return "Ação desconhecida para este módulo.";
  }
  const client = createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return "Sessão inválida. Faça login novamente.";
  const { data, error } = await client.rpc("staff_can_module_action", {
    p_module: module, p_action: action,
  });
  if (error || data !== true) return "Sem permissão para esta operação.";
  return null;
}
