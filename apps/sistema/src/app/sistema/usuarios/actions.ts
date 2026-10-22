"use server";

import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { recordAuditEventSupabase } from "../../../providers/supabase/auditEvents.supabase";

const SISTEMA_BASE_URL = process.env.NEXT_PUBLIC_SISTEMA_URL ??
  (process.env.NODE_ENV === "production" ? "https://controle.altnix.com.br" : "http://localhost:3001");

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
    redirectTo: `${SISTEMA_BASE_URL}/definir-senha`,
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

  try {
    await recordAuditEventSupabase(supabase, {
      userId: user.id,
      entityType: "users",
      entityId: invited.user.id,
      action: "invite",
      metadata: { email: trimmedEmail, role },
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria de convite de usuário:", error instanceof Error ? error.message : error);
  }

  return { ok: true };
}


/**
 * Recuperação assistida: admins enviam um link, nunca definem nem recebem
 * uma senha. O perfil de destino e o solicitante são conferidos no servidor.
 */
export async function sendPasswordResetForUser(profileId: string): Promise<ActionResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) {
    return { error: "Usuário inválido." };
  }

  const supabase = createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { error: "Sessão inválida. Faça login novamente." };

  const { data: requester, error: requesterError } = await supabase
    .from("profiles").select("role, active").eq("id", auth.user.id).maybeSingle();
  if (requesterError || !requester?.active || !["owner", "admin"].includes(requester.role)) {
    return { error: "Você não tem permissão para redefinir senhas de usuários." };
  }
  const { data: target, error: targetError } = await supabase
    .from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (targetError || !target || target.role === "owner" ||
      (requester.role === "admin" && target.role !== "operator")) {
    return { error: "Você não tem permissão para redefinir a senha deste usuário." };
  }
  if (!hasServiceRoleKey()) {
    return { error: "Recuperação administrativa indisponível neste ambiente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: targetAccount, error: lookupError } = await admin.auth.admin.getUserById(profileId);
  const email = targetAccount.user?.email;
  if (lookupError || !email) return { error: "Não foi possível localizar o e-mail deste usuário." };

  const redirectTo = new URL(
    "/definir-senha?recovery=1",
    SISTEMA_BASE_URL,
  ).toString();
  const { error: resetError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  if (resetError) return { error: "Não foi possível enviar o link. Confira a configuração de e-mail e tente novamente." };

  try {
    await recordAuditEventSupabase(supabase, {
      userId: auth.user.id,
      entityType: "users",
      entityId: profileId,
      action: "password_reset_requested",
      metadata: {},
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria de redefinição de senha:", error instanceof Error ? error.message : error);
  }

  return { ok: true };
}

/**
 * O convite cria imediatamente auth.users e profiles(active=true), mas
 * isto NAO significa que a pessoa aceitou o e-mail. A confirmacao vem
 * exclusivamente do Supabase Auth, nao de campos controlados no browser.
 * Apenas owner/admin leem a situacao dos convites; expomos so ID/status.
 */
export async function listUserInvitationStatuses(): Promise<
  { ok: true; statuses: Array<{ id: string; pending: boolean }> } | { error: string }
> {
  const client = createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return { error: "Sessão inválida." };
  const { data: requester, error: profileError } = await client.from("profiles")
    .select("role,active").eq("id", auth.user.id).maybeSingle();
  if (profileError || !requester?.active || !["owner","admin"].includes(requester.role)) {
    return { error: "Sem permissão para consultar convites." };
  }
  if (!hasServiceRoleKey()) return { error: "Consulta de convites indisponível neste ambiente." };
  const admin = createSupabaseAdminClient();
  const statuses: Array<{ id: string; pending: boolean }> = [];
  const perPage = 200;
  for (let page = 1; page <= 30; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return { error: "Não foi possível conferir o aceite dos convites." };
    statuses.push(...data.users.map((u) => ({
      id: u.id, pending: Boolean(u.invited_at && !u.email_confirmed_at),
    })));
    if (data.users.length < perPage) return { ok: true, statuses };
  }
  return { error: "Lista de contas excedeu o limite de consulta. Revise a paginação." };
}
