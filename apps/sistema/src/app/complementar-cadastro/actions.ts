"use server";

// Bloco D — Página pública de complementação cadastral (02/11/2026).
// Mesmo padrão de apps/sistema/src/app/assinar-contrato-comercial/actions.ts:
// o visitante nunca recebe uma chave privilegiada — toda escrita passa
// pela camada de serviço (createSupabaseAdminClient) chamando as funções
// SECURITY DEFINER de 20261120310000_client_completion_public_flow.sql,
// e toda ação exige uma sessão real do Supabase Auth (criada pelo
// próprio OTP, verificada via createSupabaseServerClient().auth.getUser()
// — nunca um client_id/auth_user_id vindo direto do navegador).
import {
  clientCompletionTokenHash, clientCompletionTokenUsable, findClientCompletionToken,
} from "../../lib/clientes/clientCompletionTokens";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type Result<T = never> = { error: string } | ({ ok: true } & T);

async function requireVerifiedSession(token: string): Promise<Result<{ authUserId: string }>> {
  const row = await findClientCompletionToken(token);
  if (!row) return { error: "Link indisponível ou inválido." };
  const db = createSupabaseServerClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { error: "Confirme o código de verificação antes de continuar." };
  return { ok: true, authUserId: data.user.id };
}

export async function sendClientCompletionOtpAction(token: string): Promise<Result<{ sent: true }>> {
  try {
    const row = await findClientCompletionToken(token);
    if (!row || !clientCompletionTokenUsable(row)) return { error: "Link indisponível, expirado ou já utilizado." };
    const admin = createSupabaseAdminClient();
    const { error: rateError } = await admin.rpc("reserve_client_completion_otp", {
      p_token_sha256: clientCompletionTokenHash(token),
    });
    if (rateError) return { error: rateError.message };

    const db = createSupabaseServerClient();
    const { error } = row.channel === "email"
      ? await db.auth.signInWithOtp({ email: row.channel_value, options: { shouldCreateUser: true } })
      : await db.auth.signInWithOtp({ phone: row.channel_value, options: { shouldCreateUser: true } });
    if (error) return { error: "Não foi possível enviar o código. Confira a configuração do canal no Supabase Auth." };
    return { ok: true, sent: true };
  } catch {
    return { error: "Serviço de verificação indisponível." };
  }
}

export async function verifyClientCompletionOtpAction(token: string, code: string): Promise<Result<{ verified: true }>> {
  try {
    const row = await findClientCompletionToken(token);
    if (!row || !clientCompletionTokenUsable(row)) return { error: "Link indisponível ou já utilizado." };
    if (!/^\d{4,8}$/.test(code.trim())) return { error: "Código inválido." };

    const db = createSupabaseServerClient();
    const { data, error } = row.channel === "email"
      ? await db.auth.verifyOtp({ email: row.channel_value, token: code.trim(), type: "email" })
      : await db.auth.verifyOtp({ phone: row.channel_value, token: code.trim(), type: "sms" });
    if (error || !data.user?.id) return { error: "Código incorreto ou expirado." };

    const admin = createSupabaseAdminClient();
    const { error: saveError } = await admin.rpc("verify_client_completion_channel", {
      p_token_sha256: clientCompletionTokenHash(token), p_auth_user_id: data.user.id,
    });
    if (saveError) return { error: "Não foi possível confirmar a verificação." };
    return { ok: true, verified: true };
  } catch {
    return { error: "Falha na verificação do código." };
  }
}

export interface ClientCompletionSnapshot {
  clientId: string;
  kind: "individual" | "company";
  fullName: string | null;
  companyName: string | null;
  tradeName: string | null;
  birthDate: string | null;
  foundingDate: string | null;
  phonePrimary: string | null;
  whatsapp: string | null;
  email: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  familyMembersConfirmedEmpty: boolean;
  familyMembers: Array<{ id: string; displayName: string; relationship: string | null; birthMonth: number; birthDay: number; consentStatus: string }>;
  relatedPersons: Array<{ id: string; fullName: string; roleType: string; phone: string | null; email: string | null }>;
  titularConsent: string | null;
}

export async function getClientCompletionSnapshotAction(token: string): Promise<Result<{ snapshot: ClientCompletionSnapshot }>> {
  const session = await requireVerifiedSession(token);
  if ("error" in session) return session;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_client_completion_snapshot", {
    p_token_sha256: clientCompletionTokenHash(token), p_auth_user_id: session.authUserId,
  });
  if (error || !data) return { error: error?.message ?? "Não foi possível carregar o cadastro." };
  return { ok: true, snapshot: data as ClientCompletionSnapshot };
}

export interface ClientCompletionUpdates {
  phone_primary?: string; phone_secondary?: string; whatsapp?: string; email?: string;
  address_zip?: string; address_street?: string; address_number?: string; address_complement?: string;
  address_neighborhood?: string; address_city?: string; address_state?: string;
  birth_date?: string; founding_date?: string;
  family_members_confirmed_empty?: boolean;
  titular_consent?: boolean;
}

export async function saveClientCompletionDataAction(
  token: string, updates: ClientCompletionUpdates, finalize: boolean,
): Promise<Result<{ completed: boolean }>> {
  const session = await requireVerifiedSession(token);
  if ("error" in session) return session;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("consume_client_completion_token", {
    p_token_sha256: clientCompletionTokenHash(token), p_auth_user_id: session.authUserId,
    p_updates: updates, p_finalize: finalize,
  });
  if (error) return { error: error.message };
  return { ok: true, completed: finalize };
}

export async function addClientCompletionFamilyMemberAction(token: string, input: {
  displayName: string; relationship?: string; birthMonth: number; birthDay: number; consent: boolean;
}): Promise<Result<{ id: string }>> {
  const session = await requireVerifiedSession(token);
  if ("error" in session) return session;
  if (!input.displayName.trim()) return { error: "Informe o nome do familiar." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("public_complete_add_family_member", {
    p_token_sha256: clientCompletionTokenHash(token), p_auth_user_id: session.authUserId,
    p_display_name: input.displayName.trim(), p_relationship: input.relationship?.trim() || null,
    p_birth_month: input.birthMonth, p_birth_day: input.birthDay, p_consent: input.consent,
  });
  if (error || !data) return { error: error?.message ?? "Não foi possível adicionar o familiar." };
  return { ok: true, id: data as string };
}

export async function addClientCompletionRelatedPersonAction(token: string, input: {
  fullName: string; roleType: "responsavel" | "socio" | "colaborador" | "outro"; phone?: string; email?: string;
}): Promise<Result<{ id: string }>> {
  const session = await requireVerifiedSession(token);
  if ("error" in session) return session;
  if (!input.fullName.trim()) return { error: "Informe o nome da pessoa vinculada." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("public_complete_add_related_person", {
    p_token_sha256: clientCompletionTokenHash(token), p_auth_user_id: session.authUserId,
    p_full_name: input.fullName.trim(), p_role_type: input.roleType,
    p_phone: input.phone?.trim() || null, p_email: input.email?.trim() || null,
  });
  if (error || !data) return { error: error?.message ?? "Não foi possível adicionar a pessoa vinculada." };
  return { ok: true, id: data as string };
}
