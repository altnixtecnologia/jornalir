"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Result = { ok: true } | { error: string };
export async function setClientDigitalExportAction(clientId: string, enabled: boolean): Promise<Result> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId) ||
      typeof enabled !== "boolean") return { error: "Cliente ou opção inválidos." };
  const client = createSupabaseServerClient();
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) return { error: "Sessão inválida." };
  const { data: allowed, error: permissionError } = await client.rpc("is_active_admin_or_owner");
  if (permissionError || allowed !== true) return { error: "Somente um administrador pode liberar a integração." };
  const { data, error } = await client.rpc("set_client_digital_export_permission", {
    p_client_id: clientId, p_enabled: enabled,
  });
  if (error || data !== true) return { error: error?.message || "Não foi possível registrar a autorização." };
  revalidatePath("/sistema/clientes/" + clientId);
  return { ok: true };
}
