"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Concessão EXPLÍCITA do poder de assinar contratos comerciais
 * (`publicidade.contratos_assinar`), inclusive para administrador e
 * proprietário. Regras (a RLS repete): o proprietário concede/revoga para
 * qualquer usuário ativo (inclusive ele mesmo); o administrador só para
 * operadores. A auditoria (grant/revoke, critical=true) é gravada por
 * trigger no banco, atômica com a alteração. Escreve com o cliente da
 * sessão — nunca service role — então a RLS é a barreira final.
 */

type Result = { error: string } | { ok: true };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setContractSigningGrantAction(profileId: string, allowed: boolean): Promise<Result> {
  if (!UUID_RE.test(profileId)) return { error: "Usuário inválido." };
  const client = createSupabaseServerClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) return { error: "Sessão inválida. Faça login novamente." };

  const [{ data: actor }, { data: target }] = await Promise.all([
    client.from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle(),
    client.from("profiles").select("role, active").eq("id", profileId).maybeSingle(),
  ]);
  if (!actor?.active || (actor.role !== "owner" && actor.role !== "admin")) {
    return { error: "Somente administrador ou proprietário gerencia esta concessão." };
  }
  if (!target) return { error: "Usuário não encontrado." };
  if (actor.role === "admin" && target.role !== "operator") {
    return { error: "Somente o proprietário concede ou revoga este poder para administradores e proprietário." };
  }
  if (allowed && !target.active) return { error: "Ative o acesso do usuário antes de conceder este poder." };

  const { data, error } = await client
    .from("staff_module_action_permissions")
    .upsert(
      { profile_id: profileId, module_key: "publicidade", action_key: "contratos_assinar", allowed },
      { onConflict: "profile_id,module_key,action_key" },
    )
    .select("profile_id")
    .maybeSingle();
  if (error || !data) return { error: "Não foi possível salvar a concessão. Verifique suas permissões e tente novamente." };
  revalidatePath("/sistema/usuarios");
  return { ok: true };
}
