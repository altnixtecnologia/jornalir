import "server-only";
import type { StaffFinanceActionKey } from "./staffPermissionsCatalog";
import { createSupabaseServerClient } from "../supabase/server";

/** Nunca confiar na ocultacao de botoes; verificar a permissao na requisicao.
 * A RLS do banco precisa ser endurecida antes do merge em producao.
 */
export async function checkFinanceAction(action: StaffFinanceActionKey): Promise<string | null> {
  const client = createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return "Sessão inválida. Faça login novamente.";
  const { data: granted, error } = await client.rpc("staff_can_finance_action", { p_action: action });
  if (error || granted !== true) return "Sem permissão para esta operação financeira.";
  return null;
}
