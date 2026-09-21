"use server";

import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export type InviteRole = "operator" | "admin";
type ActionResult = { ok: true } | { error: string };

/**
 * Convite administrativo de usuário — sempre server-side (Fase 20).
 * Nunca confia em nada vindo do cliente sobre "quem sou eu": revalida a
 * sessão de quem está chamando (`getUser()`, contra o servidor de Auth) e
 * o `profiles` real dessa pessoa antes de decidir se o convite é
 * permitido. Usa a Admin API (`service_role`, só em `lib/supabase/admin`,
 * nunca no navegador) — não sequestra a sessão de quem convida, diferente
 * de `signUp()`/`signInWithOtp()` do lado do cliente.
 */
export async function inviteUser(email: string, role: InviteRole): Promise<ActionResult> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return { error: "Informe o e-mail da pessoa a convidar." };
  if (role !== "operator" && role !== "admin") return { error: "Papel inválido." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão inválida. Faça login novamente." };

  const { data: requester } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester || !requester.active) return { error: "Conta inativa." };
  if (requester.role !== "owner" && requester.role !== "admin") {
    return { error: "Você não tem permissão para convidar usuários." };
  }
  if (role === "admin" && requester.role !== "owner") {
    return { error: "Somente o proprietário pode convidar administradores." };
  }

  if (!hasServiceRoleKey()) {
    return {
      error:
        "Criação de usuários ainda não está habilitada neste ambiente (SUPABASE_SERVICE_ROLE_KEY não configurada).",
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SISTEMA_URL ?? "http://localhost:3001"}/definir-senha`,
  });
  if (inviteError || !invited.user) {
    return { error: "Não foi possível enviar o convite. Confira o e-mail e tente novamente." };
  }

  // O trigger de auth.users já criou o profile como "operator". Promover a
  // admin é um segundo passo, agora possível de verdade (diferente do
  // signInWithOtp anterior) porque a Admin API devolve o id do usuário
  // criado — usamos o cliente admin (service_role) para não depender da
  // RLS de profiles nesta escrita pontual.
  if (role === "admin") {
    const { error: promoteError } = await admin.from("profiles").update({ role: "admin" }).eq("id", invited.user.id);
    if (promoteError) {
      return { error: "Convite enviado, mas não foi possível definir o papel como Administrador. Promova manualmente na lista." };
    }
  }

  return { ok: true };
}
