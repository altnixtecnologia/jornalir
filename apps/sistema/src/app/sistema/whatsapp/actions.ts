"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { checkModuleAction } from "../../../lib/permissions/checkModuleAction";
import type { WhatsappCaseStatus } from "../../../features/whatsapp/whatsappTypes";

const PATH = "/sistema/whatsapp";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const VALID_STATUS: readonly WhatsappCaseStatus[] = ["pending", "in_progress", "done"];
type ActionResult<T = undefined> = { ok: true; data: T } | { error: string };

function clean(value: string, length: number): string {
  return value.trim().slice(0, length);
}

async function permitted(): Promise<{ db: SupabaseClient; userId: string } | null> {
  const db = createSupabaseServerClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return null;
  return { db, userId: auth.user.id };
}

/** Cria um registro INTERNO de atendimento (responsável/situação/
 * observações) — nunca envia, recebe ou sincroniza mensagens reais do
 * WhatsApp. A equipe continua usando o WhatsApp normalmente (ver botão
 * "Abrir WhatsApp de Atendimento"); isto é só a organização interna. */
export async function createAttendanceCase(input: {
  contactName: string; contactPhone: string; notes: string;
}): Promise<ActionResult<{ id: string }>> {
  const permissionError = await checkModuleAction("whatsapp", "atendimento_gerenciar");
  if (permissionError) return { error: permissionError };
  const caller = await permitted();
  if (!caller) return { error: "Sessão inválida. Faça login novamente." };
  const contactName = clean(input.contactName, 180);
  if (!contactName) return { error: "Informe o nome ou identificação do contato." };
  const { db, userId } = caller;
  const { data, error } = await db.from("whatsapp_attendance_cases").insert({
    contact_name: contactName,
    contact_phone: clean(input.contactPhone, 40) || null,
    notes: clean(input.notes, 2000) || null,
    created_by: userId,
  }).select("id").single();
  if (error || !data) return { error: "Não foi possível criar o registro de atendimento." };
  revalidatePath(PATH);
  return { ok: true, data: { id: data.id } };
}

export async function setAttendanceCaseStatus(id: string, status: WhatsappCaseStatus): Promise<ActionResult> {
  const permissionError = await checkModuleAction("whatsapp", "atendimento_gerenciar");
  if (permissionError) return { error: permissionError };
  const caller = await permitted();
  if (!caller) return { error: "Sessão inválida. Faça login novamente." };
  if (!UUID.test(id) || !VALID_STATUS.includes(status)) return { error: "Dados inválidos." };
  const { error } = await caller.db.from("whatsapp_attendance_cases")
    .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível alterar a situação do atendimento." };
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/** Atribui ou transfere o atendimento; profileId=null para "sem responsável". */
export async function assignAttendanceCase(id: string, profileId: string | null): Promise<ActionResult> {
  const permissionError = await checkModuleAction("whatsapp", "atendimento_gerenciar");
  if (permissionError) return { error: permissionError };
  const caller = await permitted();
  if (!caller) return { error: "Sessão inválida. Faça login novamente." };
  if (!UUID.test(id) || (profileId !== null && !UUID.test(profileId))) return { error: "Dados inválidos." };
  const { error } = await caller.db.from("whatsapp_attendance_cases")
    .update({ assigned_to: profileId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível atribuir o atendimento." };
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function saveAttendanceCaseNotes(id: string, notes: string): Promise<ActionResult> {
  const permissionError = await checkModuleAction("whatsapp", "atendimento_gerenciar");
  if (permissionError) return { error: permissionError };
  const caller = await permitted();
  if (!caller) return { error: "Sessão inválida. Faça login novamente." };
  if (!UUID.test(id)) return { error: "Registro inválido." };
  const { error } = await caller.db.from("whatsapp_attendance_cases")
    .update({ notes: clean(notes, 2000) || null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Não foi possível salvar as observações." };
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
