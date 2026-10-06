import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditContext, UserRole } from "@ir/types";

function mapProfileRoleToAuditRole(role: string): UserRole {
  // profiles.role é "owner" | "admin" | "operator" (Fase 22); AuditContext
  // ainda usa o contrato mais antigo "admin" | "editorial" — owner/admin
  // mapeiam para "admin", operator para "editorial".
  return role === "operator" ? "editorial" : "admin";
}

/**
 * Contexto de auditoria a partir da sessão real do Supabase — nunca um
 * ator inventado. Toda Server Action que chama isto já roda atrás do
 * middleware de `/sistema/*` (exige sessão ativa + `profiles.active`),
 * então a ausência de usuário/perfil aqui é tratada como erro da própria
 * ação, nunca como motivo para inventar um ator.
 */
export async function getAuditContext(supabase: SupabaseClient): Promise<AuditContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão inválida. Faça login novamente.");

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.active) throw new Error("Conta inativa. Faça login novamente.");

  return { actorId: user.id, actorRole: mapProfileRoleToAuditRole(profile.role) };
}
