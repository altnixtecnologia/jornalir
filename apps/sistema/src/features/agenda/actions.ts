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
      responsibleProfileId: string;
      agendaEventId: string;
    } {
  const title = value(formData, "title");
  const weekStart = value(formData, "week_start");
  const dueDate = value(formData, "due_date");
  const dueTime = value(formData, "due_time");
  const description = value(formData, "description");
  const responsibleProfileId = value(formData, "responsible_profile_id");
  const agendaEventId = value(formData, "agenda_event_id");

  if (!title || title.length > 240) return { error: "Informe o que precisa ser feito." };
  if (!validDate(weekStart) || startOfWeek(weekStart) !== weekStart) return { error: "Semana inválida." };
  if (dueDate && (!validDate(dueDate) || dueDate < weekStart || dueDate > addDays(weekStart, 6))) {
    return { error: "O dia precisa estar dentro da semana selecionada." };
  }
  if (!validTime(dueTime)) return { error: "Horário inválido." };
  if (description.length > 4000) return { error: "Observação muito longa." };
  return { title, weekStart, dueDate, dueTime, description, responsibleProfileId, agendaEventId };
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
    const { data: updated, error } = await supabase
      .from("agenda_events")
      .update({
        title: input.title,
        description: input.description || null,
        event_date: input.eventDate,
        start_time: input.startTime || null,
        end_time: input.endTime || null,
        location: input.location || null,
        reminder_minutes: input.reminderMinutes,
      })
      .eq("id", eventId)
      .select("id")
      .maybeSingle();
    if (error || !updated) return { error: error?.message ?? "Compromisso nao encontrado ou sem permissao." };

    await replaceEventAssignees(supabase, eventId, input.assigneeIds);
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
    const { data, error } = await supabase.from("agenda_events").update({ status }).eq("id", eventId).select("id").maybeSingle();
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
    if (input.responsibleProfileId) await validateActiveProfiles(supabase, [input.responsibleProfileId]);
    const { error } = await supabase.from("weekly_pauta_items").insert({
      week_start: input.weekStart,
      title: input.title,
      description: input.description || null,
      due_date: input.dueDate || null,
      due_time: input.dueTime || null,
      responsible_profile_id: input.responsibleProfileId || null,
      agenda_event_id: input.agendaEventId || null,
    });
    if (error) return { error: error.message };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível adicionar a pauta." };
  }
}

export async function updatePautaItemAction(itemId: string, formData: FormData): Promise<AgendaActionResult> {
  if (!itemId) return { error: "Item inválido." };
  const input = validatePautaPayload(formData);
  if ("error" in input) return input;

  try {
    const { supabase } = await requireActiveUser();
    if (input.responsibleProfileId) await validateActiveProfiles(supabase, [input.responsibleProfileId]);
    const { data: updated, error } = await supabase
      .from("weekly_pauta_items")
      .update({
        title: input.title,
        description: input.description || null,
        due_date: input.dueDate || null,
        due_time: input.dueTime || null,
        responsible_profile_id: input.responsibleProfileId || null,
        agenda_event_id: input.agendaEventId || null,
      })
      .eq("id", itemId)
      .select("id")
      .maybeSingle();
    if (error || !updated) return { error: error?.message ?? "Pauta nao encontrada ou sem permissao." };
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
    const { data, error } = await supabase.from("weekly_pauta_items").update({ status }).eq("id", itemId).select("id").maybeSingle();
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
    const eventResult = await supabase
      .from("agenda_events")
      .select("id, title, event_date, start_time")
      .eq("id", eventId)
      .maybeSingle();
    if (eventResult.error || !eventResult.data) {
      return { error: eventResult.error?.message ?? "Compromisso não encontrado." };
    }

    const assignmentResult = await supabase
      .from("agenda_event_assignees")
      .select("profile_id")
      .eq("event_id", eventId)
      .eq("assignment_type", "responsible")
      .limit(1);
    if (assignmentResult.error) return { error: assignmentResult.error.message };

    const existingResult = await supabase
      .from("weekly_pauta_items")
      .select("id")
      .eq("agenda_event_id", eventId)
      .neq("status", "cancelled")
      .limit(1);
    if (existingResult.error) return { error: existingResult.error.message };
    if ((existingResult.data ?? []).length) return { error: "Esse compromisso já está ligado à pauta." };

    const event = eventResult.data;
    const { error } = await supabase.from("weekly_pauta_items").insert({
      week_start: startOfWeek(event.event_date),
      title: event.title,
      due_date: event.event_date,
      due_time: event.start_time,
      responsible_profile_id: assignmentResult.data?.[0]?.profile_id ?? null,
      agenda_event_id: event.id,
    });
    if (error) return { error: error.message };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível enviar o compromisso para a pauta." };
  }
}
