import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocalPreviewEnabled } from "../auth/localPreview";
import type { FinanceActionKey } from "./staffPermissionsCatalog";

/** Validação no servidor, independente da UI; falhas negam o acesso. */
export async function financePermissionError(
  action: FinanceActionKey,
  client?: SupabaseClient,
): Promise<string | null> {
  if (isLocalPreviewEnabled()) return null;
  const { createSupabaseServerClient } = await import("../supabase/server");
  const supabase = client ?? createSupabaseServerClient();
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return "Sessão inválida. Faça login novamente.";
    const { data: allowed, error } = await supabase.rpc("staff_can_finance_action", { p_action: action });
    if (error || allowed !== true) return "Você não tem permissão para realizar esta operação financeira.";
    return null;
  } catch {
    return "Não foi possível validar sua permissão financeira. Operação bloqueada.";
  }
}
