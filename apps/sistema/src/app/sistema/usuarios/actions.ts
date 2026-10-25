"use server";

import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { recordAuditEventSupabase } from "../../../providers/supabase/auditEvents.supabase";
import { normalizeStaffName } from "../../../lib/auth/userIdentity";
import { describeAuthMailError } from "../../../lib/auth/authMailDiagnostics";
import { staffAuthRedirectUrl } from "../../../lib/auth/staffAuthRedirect";

function authCallbackUrl(recovery = false): string {
  return staffAuthRedirectUrl({
    configuredBaseUrl: process.env.NEXT_PUBLIC_SISTEMA_URL,
    production: process.env.NODE_ENV === "production",
    recovery,
  });
}

export type InviteRole = "operator" | "admin";

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/** Todos os atos administrativos validam novamente a pessoa logada. */
async function requireUserManager(): Promise<
  { id: string; role: "owner" | "admin" } | { error: string }
> {
  const supabase = createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { error: "Sessão inválida. Faça login novamente." };
  const { data: profile, error } = await supabase.from("profiles")
    .select("role,active").eq("id", auth.user.id).maybeSingle();
  if (error || !profile?.active || !["owner", "admin"].includes(profile.role)
      || !auth.user.email_confirmed_at) {
    return { error: "Sem permissão para administrar usuários." };
  }
  const {data:confirmedManager,error:grantError}=
    await supabase.rpc("is_active_admin_or_owner");
  if(grantError||confirmedManager!==true)
    return {error:"Confirme seu e-mail e sua autorização administrativa."};
  return { id: auth.user.id, role: profile.role as "owner" | "admin" };
}

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
export async function inviteUser(email: string, name: string, role: InviteRole): Promise<ActionResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!validEmail(trimmedEmail)) return { error: "Informe um e-mail válido." };
  const displayName = normalizeStaffName(name);
  if (!displayName) return { error: "Informe o nome real do usuário (3 a 120 caracteres)." };
  if (role !== "operator" && role !== "admin") return { error: "Papel inválido." };

  const manager=await requireUserManager();
  if("error" in manager) return manager;
  if(role==="admin" && manager.role!=="owner") {
    return {error:"Somente o proprietário pode convidar administradores."};
  }
  const supabase=createSupabaseServerClient();

  if (!hasServiceRoleKey()) {
    return {
      error:
        "Criação de usuários ainda não está habilitada neste ambiente (SUPABASE_SERVICE_ROLE_KEY não configurada).",
    };
  }

  let redirectTo: string;
  try { redirectTo = authCallbackUrl(); }
  catch (error) { return { error: error instanceof Error ? error.message : "URL de convite inválida." }; }

  const admin = createSupabaseAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
    data: { name: displayName },
    redirectTo,
  });
  if (inviteError || !invited.user) {
    console.error("Erro Supabase Auth ao convidar:", inviteError?.code ?? "unknown");
    if (inviteError?.message?.toLowerCase().includes("already") ||
        inviteError?.message?.toLowerCase().includes("registered")) {
      return { error: "Este e-mail já possui cadastro. Se o convite estiver pendente, use 'Reenviar acesso' na lista." };
    }
    if (inviteError?.status === 429) {
      return { error: "Limite de envio de e-mails atingido no Supabase. Aguarde e confira o SMTP em Authentication." };
    }
    return { error: describeAuthMailError(inviteError,"invite") };
  }

  // Autorizar colaborador explicitamente. OTP/assinaturas externas nunca
  // inserem registro em staff_memberships e não podem entrar no painel.
  const {error:membershipError}=await admin.from("staff_memberships").insert({
    profile_id:invited.user.id,invited_by:manager.id,
  });
  if(membershipError){
    console.error("Erro na autorização do colaborador:",membershipError.code);
    return {error:"Convite solicitado, mas colaborador não autorizado. Conta permanece inativa; solicite conferência administrativa."};
  }
  // Novos perfis começam INATIVOS pelo trigger. Somente aqui, depois
  // da autenticação de owner/admin e convite aceito pelo Auth,
  // habilitar staff explicitamente e gravar o nome real.
  const { data: namedProfile, error: nameError } = await admin.from("profiles")
    .update({name:displayName,role,active:true})
    .eq("id",invited.user.id).eq("active",false)
    .select("id").maybeSingle();
  if (nameError || !namedProfile) {
    console.error("Falha ao salvar nome do convidado:", nameError?.code ?? "profile_not_found");
    return { error: "Convite solicitado, mas a conta ficou inativa por falha de autorização. Solicite correção administrativa." };
  }


  try {
    await recordAuditEventSupabase(supabase, {
      userId: manager.id,
      entityType: "users",
      entityId: invited.user.id,
      action: "invite",
      metadata: { role, nameProvided: true },
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria de convite de usuário:", error instanceof Error ? error.message : error);
  }

  return { ok: true };
}


async function requireManagedStaffTarget(profileId:string):Promise<
 {ok:true}|{error:string}
> {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId))
  return {error:"Usuário inválido."};
 const client=createSupabaseServerClient();
 const {data,error}=await client.from("staff_memberships")
   .select("profile_id").eq("profile_id",profileId).maybeSingle();
 if(error||!data) return {error:"Conta externa não é colaborador autorizado do painel."};
 return {ok:true};
}

/** Atualização administrativa de nome e e-mail, somente de colaboradores do painel.
 * A operação no Auth é server-side e não dispara convites; o SMTP precisa
 * estar funcional para que um convite pendente possa ser reenviado.
 */
export async function updateManagedUserDetails(
  profileId: string, name: string, email: string,
): Promise<{ ok: true; emailChanged: boolean } | { error: string }> {
  const manager = await requireUserManager();
  if ("error" in manager) return manager;
  const membership = await requireManagedStaffTarget(profileId);
  if ("error" in membership) return membership;
  if (!hasServiceRoleKey()) return { error: "Administração indisponível neste ambiente." };

  const cleanName = normalizeStaffName(name);
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName) return { error: "Informe nome completo válido (3 a 120 caracteres)." };
  if (!validEmail(cleanEmail)) return { error: "Informe um e-mail válido." };

  const client = createSupabaseServerClient();
  const { data: profile, error: profileError } = await client.from("profiles")
    .select("role,name").eq("id", profileId).maybeSingle();
  if (profileError || !profile || profile.role === "owner"
      || (manager.role === "admin" && profile.role !== "operator")) {
    return { error: "Sem permissão para editar os dados desta pessoa." };
  }

  const admin = createSupabaseAdminClient();
  const { data: account, error: lookupError } = await admin.auth.admin.getUserById(profileId);
  if (lookupError || !account.user?.email) return { error: "Não foi possível conferir a conta no Supabase Auth." };
  const originalEmail = account.user.email.toLowerCase();
  const emailChanged = originalEmail !== cleanEmail;
  const originalName = profile.name;

  if (originalName === cleanName && !emailChanged) return { ok: true, emailChanged: false };

  // Atualiza primeiro o perfil. Se Auth falhar, tenta desfazer somente
  // esta mudança sem tocar no papel, ativação, convite ou confirmação.
  const { data: changed, error: changeError } = await admin.from("profiles")
    .update({ name: cleanName })
    .eq("id", profileId).eq("role", profile.role)
    .select("id").maybeSingle();
  if (changeError || !changed) return { error: "Não foi possível atualizar o nome do colaborador." };

  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    ...(emailChanged ? { email: cleanEmail } : {}),
    user_metadata: { ...(account.user.user_metadata ?? {}), name: cleanName },
  });
  if (authError) {
    const { error: rollbackError } = await admin.from("profiles")
      .update({ name: originalName }).eq("id", profileId);
    if (rollbackError) {
      console.error("Falha ao restaurar nome após erro no Auth:", rollbackError.code);
      return { error: "Auth recusou a alteração e não foi possível restaurar o nome anterior. Refaça a conferência antes de tentar novamente." };
    }
    const duplicate = authError.message?.toLowerCase().includes("already") ||
      authError.message?.toLowerCase().includes("registered") ||
      authError.message?.toLowerCase().includes("exists");
    return { error: duplicate
      ? "Este e-mail já pertence a outra conta."
      : "Não foi possível atualizar os dados no Supabase Auth. Nenhum convite foi enviado." };
  }

  // Nunca forçar email_confirmed_at, email_confirm ou gerar token.
  await recordAuditEventSupabase(client, {
    userId: manager.id, entityType: "users", entityId: profileId,
    action: "update_user_details", metadata: {
      nameChanged: originalName !== cleanName, emailChanged,
    },
  }).catch(e => console.error("Falha auditoria edição de usuário:", e instanceof Error ? e.message : "unknown"));

  return { ok: true, emailChanged };
}

/**
 * Permite cadastrar/corrigir o nome real sem alterar as permissões
 * nem o estado de confirmação do Supabase Auth.
 */
export async function updateManagedUserName(profileId: string, name: string): Promise<ActionResult> {
  const manager = await requireUserManager();
  if ("error" in manager) return manager;
  const membership=await requireManagedStaffTarget(profileId);
  if("error" in membership) return membership;
  const clean = normalizeStaffName(name);
  if (!clean) return { error: "Informe um nome real válido (3 a 120 caracteres)." };
  if (!hasServiceRoleKey()) return { error: "Administração indisponível neste ambiente." };
  const admin = createSupabaseAdminClient();
  const client = createSupabaseServerClient();
  const { data: target, error: targetError } = await client.from("profiles")
    .select("role").eq("id", profileId).maybeSingle();
  if (targetError || !target || target.role === "owner" ||
      (manager.role === "admin" && target.role !== "operator")) {
    return { error: "Sem permissão para editar o nome desta pessoa." };
  }
  const { data: changed, error } = await admin.from("profiles").update({ name: clean })
    .eq("id", profileId).select("id").maybeSingle();
  if (error || !changed) return { error: "Falha ao atualizar o nome do perfil." };

  // Sincroniza metadata para futuras integrações sem mudar auth.email.
  const { error: metadataError } = await admin.auth.admin.updateUserById(profileId, {
    user_metadata: { name: clean },
  });
  if (metadataError) {
    // profiles.name é a fonte de verdade do painel. Uma falha secundária
    // do Auth não deve esconder uma alteração que já foi persistida.
    console.error("Falha ao sincronizar nome no Auth:", metadataError.code);
  }
  await recordAuditEventSupabase(client, {
    userId: manager.id, entityType: "users", entityId: profileId,
    action: "update_name", metadata: { nameProvided: true },
  }).catch(e => console.error("Falha auditoria nome:", e instanceof Error ? e.message : "unknown"));
  return { ok: true };
}

/**
 * O Supabase não fornece reenvio explícito de convite já registrado
 * pela mesma API. Para conta pendente, solicita um NOVO e-mail de
 * definição de senha pelo fluxo recovery, sem aprovar e-mail manualmente.
 * Nunca entrega tokens ao admin e nunca afirma que chegou ao destinatário.
 */
export async function resendPendingUserAccess(profileId: string): Promise<ActionResult> {
  const manager = await requireUserManager();
  if ("error" in manager) return manager;
  const membership=await requireManagedStaffTarget(profileId);
  if("error" in membership) return membership;
  if (!hasServiceRoleKey()) return { error: "Serviço de envio indisponível." };
  const client = createSupabaseServerClient();
  const { data: target, error: targetError } = await client.from("profiles")
    .select("role").eq("id", profileId).maybeSingle();
  if (targetError || !target || target.role === "owner" ||
      (manager.role === "admin" && target.role !== "operator")) {
    return { error: "Sem permissão para reenviar acesso desta pessoa." };
  }
  const admin = createSupabaseAdminClient();
  const { data: account, error: lookupError } = await admin.auth.admin.getUserById(profileId);
  if (lookupError || !account.user?.email) return { error: "E-mail da conta não localizado." };
  if (account.user.email_confirmed_at) return { error: "A pessoa já confirmou o e-mail. Utilize redefinir senha, se necessário." };
  if (!account.user.invited_at) return { error: "Conta sem convite anterior. Verifique o cadastro antes de solicitar reenvio." };

  // Validar AMBOS os destinos antes de fazer qualquer envio.
  let inviteRedirect: string;
  let recoveryRedirect: string;
  try {
    inviteRedirect = authCallbackUrl();
    recoveryRedirect = authCallbackUrl(true);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "URL de acesso inválida." };
  }

  // Tentar um novo convite para conta ainda não confirmada. Algumas
  // configurações do Auth devolvem "already registered" nesse caso;
  // somente nesse caso pedir um link de recuperação, que leva à mesma
  // tela segura de escolha de senha sem expor token ao administrador.
  const { data: profile } = await client.from("profiles")
    .select("name").eq("id", profileId).maybeSingle();
  const { error: reinviteError } = await admin.auth.admin.inviteUserByEmail(account.user.email, {
    data: { name: profile?.name || account.user.user_metadata?.name || "" },
    redirectTo: inviteRedirect,
  });
  let via: "invite" | "recovery" = "invite";
  if (reinviteError) {
    const text = reinviteError.message?.toLowerCase() ?? "";
    const duplicate = text.includes("already") || text.includes("registered") || text.includes("exists");
    if (!duplicate) {
      console.error("Supabase Auth reenvio de convite:", reinviteError.code ?? "unknown");
      return { error: reinviteError.status === 429
        ? "Limite de e-mails atingido. Aguarde e confira a configuração SMTP."
        : describeAuthMailError(reinviteError,"invite") };
    }
    via = "recovery";
    const { error: sendError } = await admin.auth.resetPasswordForEmail(account.user.email, { redirectTo: recoveryRedirect });
    if (sendError) {
      console.error("Supabase Auth reenvio de acesso:", sendError.code ?? "unknown");
      if (sendError.status === 429) return { error: "Limite de e-mails atingido. Aguarde e confira as configurações de SMTP no Supabase." };
      return { error: describeAuthMailError(sendError,"recovery") };
    }
  }
  await recordAuditEventSupabase(client, {
    userId: manager.id, entityType: "users", entityId: profileId,
    action: "access_email_resent", metadata: { via, pending: true },
  }).catch(e => console.error("Falha auditoria reenvio:", e instanceof Error ? e.message : "unknown"));
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

  const manager=await requireUserManager();
  if("error" in manager) return manager;
  const membership=await requireManagedStaffTarget(profileId);
  if("error" in membership) return membership;
  const supabase=createSupabaseServerClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (targetError || !target || target.role === "owner" ||
      (manager.role === "admin" && target.role !== "operator")) {
    return { error: "Você não tem permissão para redefinir a senha deste usuário." };
  }
  if (!hasServiceRoleKey()) {
    return { error: "Recuperação administrativa indisponível neste ambiente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: targetAccount, error: lookupError } = await admin.auth.admin.getUserById(profileId);
  const email = targetAccount.user?.email;
  if (lookupError || !email) return { error: "Não foi possível localizar o e-mail deste usuário." };

  let redirectTo: string;
  try { redirectTo = authCallbackUrl(true); }
  catch (error) { return { error: error instanceof Error ? error.message : "URL de recuperação inválida." }; }
  const { error: resetError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  if (resetError) return { error: describeAuthMailError(resetError,"recovery") };

  try {
    await recordAuditEventSupabase(supabase, {
      userId: manager.id,
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
 * O convite cria auth.users e um profile técnico inativo. Após autorização
 * administrativa, o perfil interno pode receber active=true, mas isto
 * NÃO significa que a pessoa aceitou o e-mail. A confirmação vem
 * exclusivamente do Supabase Auth, nao de campos controlados no browser.
 * Apenas owner/admin leem a situacao dos convites; expomos so ID/status.
 */
export async function listUserInvitationStatuses(): Promise<
  { ok: true; statuses: Array<{ id: string; pending: boolean; confirmed: boolean; invited: boolean; email: string }> } | { error: string }
> {
  const manager=await requireUserManager();
  if("error" in manager) return manager;
  const client=createSupabaseServerClient();
  if (!hasServiceRoleKey()) return { error: "Consulta de convites indisponível neste ambiente." };
  const admin = createSupabaseAdminClient();
  const {data:memberships,error:membershipError}=await client.from("staff_memberships")
    .select("profile_id");
  if(membershipError||!memberships)
    return {error:"Não foi possível consultar colaboradores autorizados."};
  const staffIds=new Set(memberships.map(m=>m.profile_id));
  const statuses: Array<{ id: string; pending: boolean; confirmed: boolean; invited: boolean; email: string }> = [];
  const perPage = 200;
  for (let page = 1; page <= 30; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return { error: "Não foi possível conferir o aceite dos convites." };
    statuses.push(...data.users.filter(u=>staffIds.has(u.id)).map((u) => ({
      id: u.id, pending: Boolean(u.invited_at && !u.email_confirmed_at),
      confirmed: Boolean(u.email_confirmed_at), invited: Boolean(u.invited_at), email: u.email ?? "",
    })));
    if (data.users.length < perPage) return { ok: true, statuses };
  }
  return { error: "Lista de contas excedeu o limite de consulta. Revise a paginação." };
}
