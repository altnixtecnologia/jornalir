"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { addDays, startOfWeek } from "./agendaData";

export type AgendaActionResult = { ok: true } | { error: string };

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function values(formData: FormData, key: string): string[] {
  return [...new Set(
    formData
      .getAll(key)
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function validDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const [year, month, day] = input.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.toISOString().slice(0, 10) === input;
}

function validTime(input: string): boolean {
  return input === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(input);
}

async function requireActiveUser() {
  const supabase = createSupabaseServerClient();
  const { data: authData, error } = await supabase.auth.getUser();
  const user = authData.user;
  if (error || !user) throw new Error("Sessão inválida.");

  const { data: profile } = await supabase.from("profiles").select("id, active").eq("id", user.id).maybeSingle();
  if (!profile?.active) throw new Error("Usuário sem acesso ativo.");
  return { supabase, user };
}

async function validateActiveProfiles(client: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data, error } = await client.from("profiles").select("id").in("id", ids).eq("active", true);
  if (error) throw new Error(error.message);
  const found = new Set((data ?? []).map((row) => row.id as string));
  if (ids.some((id) => !found.has(id))) throw new Error("Há um responsável inválido ou inativo.");
}

async function replaceEventAssignees(client: SupabaseClient, eventId: string, profileIds: string[]): Promise<void> {
  const { error } = await client.rpc("replace_agenda_assignees", {
    p_event_id: eventId,
    p_profile_ids: profileIds,
  });
  if (error) throw new Error(error.message);
}

function validateEventPayload(formData: FormData):
  | { error: string }
  | {
      title: string;
      eventDate: string;
      startTime: string;
      endTime: string;
      location: string;
      description: string;
      assigneeIds: string[];
      reminderMinutes: number | null;
    } {
  const title = value(formData, "title");
  const eventDate = value(formData, "event_date");
  const startTime = value(formData, "start_time");
  const endTime = value(formData, "end_time");
  const location = value(formData, "location");
  const description = value(formData, "description");
  const assigneeIds = values(formData, "assignee_profile_ids");
  const reminderRaw = value(formData, "reminder_minutes");
  const reminderMinutes = reminderRaw === "off" ? null : Number(reminderRaw || "30");
  if (reminderMinutes !== null && ![0,5,10,15,30,60,120,1440].includes(reminderMinutes)) return { error: "Lembrete inválido." };
  if (!startTime && reminderMinutes !== null) return { error: "Informe um horário de início ou escolha Sem lembrete." };

  if (!title || title.length > 180) return { error: "Informe um título válido." };
  if (!validDate(eventDate)) return { error: "Informe uma data válida." };
  if (!validTime(startTime) || !validTime(endTime)) return { error: "Horário inválido." };
  if (startTime && endTime && endTime < startTime) return { error: "O horário final não pode ser anterior ao inicial." };
  if (location.length > 240) return { error: "Local muito longo." };
  if (description.length > 4000) return { error: "Descrição muito longa." };
  return { title, eventDate, startTime, endTime, location, description, assigneeIds, reminderMinutes };
}

function validatePautaPayload(formData: FormData):
  | { error: string }
  | {
      title: string;
      weekStart: string;
      dueDate: string;
      dueTime: string;
      description: string;
      assigneeIds: string[];
    } {
  const title = value(formData, "title");
  const weekStart = value(formData, "week_start");
  const dueDate = value(formData, "due_date");
  const dueTime = value(formData, "due_time");
  const description = value(formData, "description");
  const assigneeIds = values(formData, "assignee_profile_ids");

  if (!title || title.length > 180) return { error: "Informe um título com até 180 caracteres." };
  if (!validDate(weekStart) || startOfWeek(weekStart) !== weekStart) return { error: "Semana inválida." };
  if (dueDate && (!validDate(dueDate) || dueDate < weekStart || dueDate > addDays(weekStart, 6))) {
    return { error: "O dia precisa estar dentro da semana selecionada." };
  }
  if (!dueDate) return { error: "Escolha um dia para a pauta. Todos os itens entram na Agenda." };
  if (!validTime(dueTime)) return { error: "Horário inválido." };
  if (description.length > 4000) return { error: "Observação muito longa." };
  return { title, weekStart, dueDate, dueTime, description, assigneeIds };
}

function refreshAgenda(): void {
  revalidatePath("/sistema/agenda");
  revalidatePath("/agenda");
}

function repeatDates(firstDate: string, mode: string): string[] {
  if (!["none", "weekly4", "weekly12", "monthly3"].includes(mode)) {
    throw new Error("Recorrência inválida.");
  }
  const count = mode === "weekly4" ? 4 : mode === "weekly12" ? 12 : mode === "monthly3" ? 3 : 1;
  const [year, month, day] = firstDate.split("-").map(Number);
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    let date: Date;
    if (mode === "monthly3") {
      const firstOfMonth = new Date(Date.UTC(year, month - 1 + i, 1, 12));
      const lastDay = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0, 12)).getUTCDate();
      date = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), Math.min(day, lastDay), 12));
    } else {
      date = new Date(Date.UTC(year, month - 1, day + (mode === "none" ? 0 : i * 7), 12));
    }
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

export async function createAgendaEventAction(formData: FormData): Promise<AgendaActionResult> {
  const input = validateEventPayload(formData);
  if ("error" in input) return input;

  try {
    const { supabase } = await requireActiveUser();
    await validateActiveProfiles(supabase, input.assigneeIds);
    const dates = repeatDates(input.eventDate, value(formData, "recurrence") || "none");
    // Uma unica transacao no Postgres: ou grava todas as ocorrencias e todos
    // os responsaveis, ou nao grava nenhuma.
    const { data: inserted, error } = await supabase.rpc("create_agenda_occurrences", {
      p_title: input.title,
      p_description: input.description || null,
      p_dates: dates,
      p_start_time: input.startTime || null,
      p_end_time: input.endTime || null,
      p_location: input.location || null,
      p_reminder_minutes: input.reminderMinutes,
      p_assignee_ids: input.assigneeIds,
    });
    if (error) return { error: error.message };
    if (Number(inserted) !== dates.length) return { error: "Nao foi possivel confirmar todas as ocorrencias." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nao foi possivel criar o compromisso." };
  }
}

export async function updateAgendaEventAction(eventId: string, formData: FormData): Promise<AgendaActionResult> {
  if (!eventId) return { error: "Compromisso inválido." };
  const input = validateEventPayload(formData);
  if ("error" in input) return input;

  try {
    const { supabase } = await requireActiveUser();
    await validateActiveProfiles(supabase, input.assigneeIds);
    // Uma transação grava a edição e todos os responsáveis.
    const { data: updated, error } = await supabase.rpc("update_agenda_event_with_assignees_checked", {
      p_event_id: eventId,
      p_title: input.title,
      p_description: input.description || null,
      p_event_date: input.eventDate,
      p_start_time: input.startTime || null,
      p_end_time: input.endTime || null,
      p_location: input.location || null,
      p_reminder_minutes: input.reminderMinutes,
      p_profile_ids: input.assigneeIds,
      p_expected_updated_at: value(formData, "updated_at"),
    });
    if (error || !updated) return { error: error?.message ?? "Compromisso não encontrado ou sem permissão." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível editar o compromisso." };
  }
}

export async function setAgendaEventStatusAction(
  eventId: string,
  status: "scheduled" | "completed" | "cancelled",
): Promise<AgendaActionResult> {
  if (!eventId) return { error: "Compromisso inválido." };
  try {
    const { supabase } = await requireActiveUser();
    const { data, error } = await supabase.rpc("set_agenda_status_managed", {
      p_event_id: eventId,
      p_status: status,
    });
    if (error || !data) return { error: error?.message ?? "Compromisso nao encontrado ou sem permissao." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível atualizar o compromisso." };
  }
}

export async function createPautaItemAction(formData: FormData): Promise<AgendaActionResult> {
  const input = validatePautaPayload(formData);
  if ("error" in input) return input;
  try {
    const { supabase } = await requireActiveUser();
    await validateActiveProfiles(supabase, input.assigneeIds);
    const { data, error } = await supabase.rpc("create_editorial_pauta_event", {
      p_title: input.title,
      p_description: input.description || null,
      p_event_date: input.dueDate,
      p_start_time: input.dueTime || null,
      p_profile_ids: input.assigneeIds,
    });
    if (error || !data) return { error: error?.message ?? "Não foi possível criar a pauta na Agenda." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível criar a pauta." };
  }
}

export async function updatePautaItemAction(itemId: string, formData: FormData): Promise<AgendaActionResult> {
  if (!itemId) return { error: "Item inválido." };
  const input = validatePautaPayload(formData);
  if ("error" in input) return input;
  try {
    const { supabase } = await requireActiveUser();
    await validateActiveProfiles(supabase, input.assigneeIds);
    const { data, error } = await supabase.rpc("update_editorial_pauta_event", {
      p_pauta_id: itemId,
      p_title: input.title,
      p_description: input.description || null,
      p_event_date: input.dueDate,
      p_start_time: input.dueTime || null,
      p_profile_ids: input.assigneeIds,
      p_expected_updated_at: value(formData, "updated_at"),
    });
    if (error || !data) return { error: error?.message ?? "A pauta foi alterada por outra pessoa. Atualize antes de salvar." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível editar a pauta." };
  }
}

export async function setPautaItemStatusAction(
  itemId: string,
  status: "pending" | "completed" | "cancelled",
): Promise<AgendaActionResult> {
  if (!itemId) return { error: "Item inválido." };
  try {
    const { supabase } = await requireActiveUser();
    const { data, error } = await supabase.rpc("set_pauta_status_managed", {
      p_item_id: itemId,
      p_status: status,
    });
    if (error || !data) return { error: error?.message ?? "Pauta nao encontrada ou sem permissao." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível atualizar a pauta." };
  }
}

export async function createPautaFromAgendaEventAction(eventId: string): Promise<AgendaActionResult> {
  if (!eventId) return { error: "Compromisso inválido." };
  try {
    const { supabase } = await requireActiveUser();
    const { data, error } = await supabase.rpc("add_agenda_event_to_pauta", { p_event_id: eventId });
    if (error || !data) return { error: error?.message ?? "Não foi possível marcar o compromisso como pauta." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível enviar o compromisso para a pauta." };
  }
}

/** Apenas o responsavel pode concluir sua propria participacao.
 * O banco encerra o compromisso quando todos os responsaveis concluem.
 */
export async function completeMyAgendaAssignmentAction(eventId: string): Promise<AgendaActionResult> {
  if (!eventId) return { error: "Compromisso inválido." };
  try {
    const { supabase } = await requireActiveUser();
    const { data, error } = await supabase.rpc("complete_my_agenda_assignment", { p_event_id: eventId });
    if (error || !data) return { error: error?.message ?? "Não foi possível concluir sua participação." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível concluir sua participação." };
  }
}

export async function completeMyPautaItemAction(itemId: string): Promise<AgendaActionResult> {
  if (!itemId) return { error: "Pauta inválida." };
  try {
    const { supabase } = await requireActiveUser();
    const { data, error } = await supabase.rpc("complete_my_pauta_item", { p_item_id: itemId });
    if (error || !data) return { error: error?.message ?? "Não foi possível concluir a pauta." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível concluir a pauta." };
  }
}
