"use server";

// Bloco B — Cadastro complementar (02/11/2026). Server Actions para:
// 1) Familiares (titular PF) — dia/mês sem ano, em public.birthday_entries
//    (origin='familiar'), nunca em public.clients (reaproveita a base
//    editorial já existente; não cria outro CRM).
// 2) Pessoas vinculadas a uma empresa (responsável/sócio/colaborador) —
//    public.client_related_persons (satélite de clients, sem duplicar CNPJ).
// 3) Link individual seguro de complementação de cadastro — gera o token
//    (uma vez) para a equipe copiar e enviar manualmente; esta ação NUNCA
//    envia nada — não há integração de envio real neste lote.
import { revalidatePath } from "next/cache";
import { onlyDigits, isValidCpf } from "@ir/core";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { checkModuleAction } from "../../../lib/permissions/checkModuleAction";

type ActionResult<T = unknown> = { error: string } | ({ ok: true } & T);

function detailPath(clientId: string): string {
  return `/sistema/clientes/${clientId}`;
}

// ---------------------------------------------------------------------
// Familiares (birthday_entries, origin='familiar')
// ---------------------------------------------------------------------

export interface FamilyMemberInput {
  displayName: string;
  birthMonth: number;
  birthDay: number;
  relationship?: string;
  knownAs?: string;
  notes?: string;
  isMinor?: boolean;
  guardianName?: string;
}

const MONTH_DAY_LIMITS: Record<number, number> = {
  1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
  7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
};

function validateFamilyMemberInput(input: FamilyMemberInput): string | null {
  if (!input.displayName.trim() || input.displayName.trim().length < 2) return "Informe o nome do familiar.";
  if (!Number.isInteger(input.birthMonth) || input.birthMonth < 1 || input.birthMonth > 12) return "Mês de nascimento inválido.";
  const maxDay = MONTH_DAY_LIMITS[input.birthMonth];
  if (!Number.isInteger(input.birthDay) || input.birthDay < 1 || input.birthDay > maxDay) return "Dia de nascimento inválido para o mês informado.";
  if (input.isMinor && !input.guardianName?.trim()) return "Para menor de idade, informe o nome do responsável.";
  return null;
}

/** Adiciona um familiar (dia/mês sem ano) vinculado ao titular. Nunca
 * marca publicação automática — consentimento sempre nasce "pending"
 * (ver birthday_entries_publish_requires_consent), nunca presumido. */
export async function addFamilyMemberAction(clientId: string, input: FamilyMemberInput): Promise<ActionResult<{ id: string }>> {
  const permissionError = await checkModuleAction("clientes", "clientes_editar");
  if (permissionError) return { error: permissionError };
  const validationError = validateFamilyMemberInput(input);
  if (validationError) return { error: validationError };

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("birthday_entries")
    .insert({
      group_client_id: clientId,
      origin: "familiar",
      display_name: input.displayName.trim(),
      birth_month: input.birthMonth,
      birth_day: input.birthDay,
      relationship: input.relationship?.trim() || null,
      known_as: input.knownAs?.trim() || null,
      notes: input.notes?.trim() || null,
      is_minor: input.isMinor ?? null,
      guardian_name: input.guardianName?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Não foi possível adicionar o familiar." };

  // Adicionar um familiar invalida qualquer confirmação anterior de
  // "sem familiares" — se a equipe adicionar mais tarde, o aviso pode
  // voltar a fazer sentido numa próxima limpeza, mas não reabre sozinho:
  // só reseta aqui porque agora HÁ pelo menos um familiar de fato.
  await supabase.from("clients").update({ family_members_confirmed_empty: true }).eq("id", clientId);

  revalidatePath(detailPath(clientId));
  return { ok: true, id: data.id as string };
}

export async function deactivateFamilyMemberAction(id: string, clientId: string): Promise<ActionResult> {
  const permissionError = await checkModuleAction("clientes", "clientes_editar");
  if (permissionError) return { error: permissionError };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("birthday_entries").update({ active: false }).eq("id", id).eq("group_client_id", clientId);
  if (error) return { error: error.message };
  revalidatePath(detailPath(clientId));
  return { ok: true };
}

/** Confirmação discreta, uma única vez: "sem familiares a cadastrar". */
export async function confirmNoFamilyMembersAction(clientId: string): Promise<ActionResult> {
  const permissionError = await checkModuleAction("clientes", "clientes_editar");
  if (permissionError) return { error: permissionError };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("clients").update({ family_members_confirmed_empty: true }).eq("id", clientId);
  if (error) return { error: error.message };
  revalidatePath(detailPath(clientId));
  return { ok: true };
}

// ---------------------------------------------------------------------
// Pessoas vinculadas a uma empresa (client_related_persons)
// ---------------------------------------------------------------------

export interface RelatedPersonInput {
  fullName: string;
  roleType: "responsavel" | "socio" | "colaborador" | "outro";
  cpf?: string;
  phone?: string;
  email?: string;
  birthMonth?: number;
  birthDay?: number;
  notes?: string;
}

function validateRelatedPersonInput(input: RelatedPersonInput): string | null {
  if (!input.fullName.trim() || input.fullName.trim().length < 2) return "Informe o nome da pessoa vinculada.";
  if (!["responsavel", "socio", "colaborador", "outro"].includes(input.roleType)) return "Tipo de vínculo inválido.";
  if (input.cpf && !isValidCpf(input.cpf)) return "CPF inválido.";
  if ((input.birthMonth && !input.birthDay) || (!input.birthMonth && input.birthDay)) return "Informe dia e mês juntos, ou nenhum dos dois.";
  return null;
}

export async function addRelatedPersonAction(clientId: string, input: RelatedPersonInput): Promise<ActionResult<{ id: string }>> {
  const permissionError = await checkModuleAction("clientes", "clientes_editar");
  if (permissionError) return { error: permissionError };
  const validationError = validateRelatedPersonInput(input);
  if (validationError) return { error: validationError };

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_related_persons")
    .insert({
      client_id: clientId,
      full_name: input.fullName.trim(),
      role_type: input.roleType,
      cpf: input.cpf ? onlyDigits(input.cpf) : null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      birth_month: input.birthMonth ?? null,
      birth_day: input.birthDay ?? null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Não foi possível adicionar a pessoa vinculada." };

  revalidatePath(detailPath(clientId));
  return { ok: true, id: data.id as string };
}

export async function deactivateRelatedPersonAction(id: string, clientId: string): Promise<ActionResult> {
  const permissionError = await checkModuleAction("clientes", "clientes_editar");
  if (permissionError) return { error: permissionError };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("client_related_persons").update({ active: false }).eq("id", id).eq("client_id", clientId);
  if (error) return { error: error.message };
  revalidatePath(detailPath(clientId));
  return { ok: true };
}

// ---------------------------------------------------------------------
// Link individual seguro de complementação de cadastro
// ---------------------------------------------------------------------

/**
 * Gera o link de complementação e devolve o token em CLARO uma única
 * vez (o banco só guarda o hash — ver generate_client_completion_token).
 * Esta ação NÃO ENVIA NADA: a equipe copia o link exibido e o envia
 * manualmente pelo canal já confirmado. A página pública que consome
 * este token fica para um lote seguinte (fora do escopo autorizado agora).
 */
export async function generateClientCompletionLinkAction(
  clientId: string,
  channel: "whatsapp" | "email",
): Promise<ActionResult<{ urlPath: string; expiresInHours: number }>> {
  const permissionError = await checkModuleAction("clientes", "clientes_editar");
  if (permissionError) return { error: permissionError };

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("generate_client_completion_token", {
    p_client_id: clientId,
    p_channel: channel,
  });
  if (error || typeof data !== "string") {
    return { error: error?.message ?? "Não foi possível gerar o link de complementação." };
  }

  // Caminho relativo, mesmo padrão de urlPath em
  // commercial-signature-invitation-actions.ts — a página que consome
  // este token ainda não existe (fica para um lote seguinte); o caminho
  // já é reservado para não exigir outra migração de rota depois.
  return { ok: true, urlPath: `/complementar-cadastro/${data}`, expiresInHours: 72 };
}
