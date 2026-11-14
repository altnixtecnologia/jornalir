import "server-only";
import type { StaffActionModule, StaffModuleActionKey } from "./staffPermissionsCatalog";
import { STAFF_MODULE_ACTIONS } from "./staffPermissionsCatalog";
import { createSupabaseServerClient } from "../supabase/server";
import { NFSE_AVAILABLE_IN_THIS_RELEASE, NFSE_POSTPONED_MESSAGE, NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE, isNfsePreparationAction } from "../release/releasePolicy";
import { isRestrictedSefinEnvironment, restrictedSefinEnvironmentFromServer } from "../nfse/restrictedSefinGate";

/** A Server Action nao pode confiar apenas nos checkboxes do painel.
 * Financeiro possui verificador proprio; Agenda/Pauta possuem regra propria.
 */
export async function checkModuleAction(
  module: StaffActionModule, action: StaffModuleActionKey,
): Promise<string | null> {
  // Preparacao no oficial permite SOMENTE funcoes administrativas
  // reversiveis de cadastro, perfis e rascunhos. Emissao/cancelamento,
  // consulta e envio de documentos permanecem bloqueados sem release.
  const fiscalPreparation = module === "nfse" && !NFSE_AVAILABLE_IN_THIS_RELEASE &&
    !isRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer());
  if (fiscalPreparation && (
    !NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE || !isNfsePreparationAction(action)
  )) return NFSE_POSTPONED_MESSAGE;
  if (!STAFF_MODULE_ACTIONS.some((item) => item.module === module && item.key === action)) {
    return "Ação desconhecida para este módulo.";
  }
  const client = createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return "Sessão inválida. Faça login novamente.";
  if (fiscalPreparation) {
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("active,role").eq("id",auth.user.id).maybeSingle();
    if (profileError || !profile?.active || (profile.role !== "owner" && profile.role !== "admin")) {
      return "Preparação fiscal disponível somente para proprietário ou administrador ativo.";
    }
  }
  const { data, error } = await client.rpc("staff_can_module_action", {
    p_module: module, p_action: action,
  });
  if (error || data !== true) return "Sem permissão para esta operação.";
  return null;
}
