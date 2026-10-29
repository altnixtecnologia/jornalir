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
  // NFS-e adiada: nenhuma Server Action de EMISSÃO recebe permissão, mesmo
  // admin/owner. Única exceção: "configuracoes_gerenciar" (cadastro fiscal
  // e certificado A1), que já é `adminOnly` no catálogo abaixo e nunca
  // transmite nem consulta nada externamente — fica sujeita só à checagem
  // normal de permissão (RPC `staff_can_module_action`), não ao bloqueio
  // geral de emissão.
  if (module === "nfse" && action !== "configuracoes_gerenciar" && !NFSE_AVAILABLE_IN_THIS_RELEASE) {
    return NFSE_POSTPONED_MESSAGE;
  }
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
