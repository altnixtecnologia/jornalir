"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { addDays, startOfWeek } from "./agendaData";

export type AgendaActionResult = { ok: true } | { error: string };

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function validDate(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(input);
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

function refreshAgenda(): void {
  revalidatePath("/sistema/agenda");
  revalidatePath("/agenda");
}

export async function createAgendaEventAction(formData: FormData): Promise<AgendaActionResult> {
  const title = value(formData, "title");
  const eventDate = value(formData, "event_date");
  const startTime = value(formData, "start_time");
  const endTime = value(formData, "end_time");
  const location = value(formData, "location");
  const description = value(formData, "description");
  const responsibleProfileId = value(formData, "responsible_profile_id");

  if (!title || title.length > 180) return { error: "Informe um título válido." };
  if (!validDate(eventDate)) return { error: "Informe uma data válida." };
  if (!validTime(startTime) || !validTime(endTime)) return { error: "Horário inválido." };
  if (startTime && endTime && endTime < startTime) return { error: "O horário final não pode ser anterior ao inicial." };
  if (location.length > 240) return { error: "Local muito longo." };
  if (description.length > 4000) return { error: "Descrição muito longa." };

  try {
    const { supabase } = await requireActiveUser();
    const { data: event, error } = await supabase
      .from("agenda_events")
      .insert({
        title,
        description: description || null,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location || null,
      })
      .select("id")
      .single();

    if (error || !event) return { error: error?.message ?? "Não foi possível criar o compromisso." };

    if (responsibleProfileId) {
      const { error: assignmentError } = await supabase.from("agenda_event_assignees").insert({
        event_id: event.id,
        profile_id: responsibleProfileId,
        assignment_type: "responsible",
      });
      if (assignmentError) {
        refreshAgenda();
        return { error: "Compromisso criado, mas não foi possível vincular o responsável." };
      }
    }

    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível criar o compromisso." };
  }
}

export async function setAgendaEventStatusAction(
  eventId: string,
  status: "scheduled" | "completed" | "cancelled",
): Promise<AgendaActionResult> {
  if (!eventId) return { error: "Compromisso inválido." };
  try {
    const { supabase } = await requireActiveUser();
    const { error } = await supabase.from("agenda_events").update({ status }).eq("id", eventId);
    if (error) return { error: error.message };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível atualizar o compromisso." };
  }
}

export async function createPautaItemAction(formData: FormData): Promise<AgendaActionResult> {
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

  try {
    const { supabase } = await requireActiveUser();
    const { error } = await supabase.from("weekly_pauta_items").insert({
      week_start: weekStart,
      title,
      description: description || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
      responsible_profile_id: responsibleProfileId || null,
      agenda_event_id: agendaEventId || null,
    });
    if (error) return { error: error.message };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível adicionar a pauta." };
  }
}

export async function setPautaItemStatusAction(
  itemId: string,
  status: "pending" | "completed" | "cancelled",
): Promise<AgendaActionResult> {
  if (!itemId) return { error: "Item inválido." };
  try {
    const { supabase } = await requireActiveUser();
    const { error } = await supabase.from("weekly_pauta_items").update({ status }).eq("id", itemId);
    if (error) return { error: error.message };
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
