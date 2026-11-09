import "server-only";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../lib/supabase/server";
import type { AgendaEventItem, AgendaProfile, AgendaWorkspaceData, EventCoverage, PendingMeetingInvitation, WeeklyPautaItem } from "./agendaTypes";
import { startOfPautaWeek } from "./pautaPeriod";

export const AGENDA_TIMEZONE = "America/Sao_Paulo";

function ymdUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function parseDateUtc(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function todayInAgendaTimezone(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AGENDA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export function normalizeAgendaDate(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parseDateUtc(value);
    if (ymdUtc(parsed) === value) return value;
  }
  return todayInAgendaTimezone();
}

export function startOfWeek(value: string): string {
  return startOfPautaWeek(value);
}

export function addDays(value: string, amount: number): string {
  const date = parseDateUtc(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return ymdUtc(date);
}

function monthBounds(value: string): { start: string; end: string } {
  const date = parseDateUtc(value);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
  return { start: ymdUtc(start), end: ymdUtc(end) };
}

function trimDbTime(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

/** Convites individuais com RLS (a própria sessão), reutilizados no painel
 * e na central de notificações. Nunca tratar como aviso administrativo global.
 */
export async function loadMyPendingMeetingInvitations(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  today: string = todayInAgendaTimezone(),
): Promise<PendingMeetingInvitation[]> {
  const myInvites = await supabase.from("agenda_event_invitees")
    .select("event_id").eq("profile_id", userId).eq("status", "pending")
    .order("invited_at", { ascending: false }).limit(50);
  if (myInvites.error) throw new Error(myInvites.error.message);
  const pendingIds = [...new Set((myInvites.data ?? []).map((row) => row.event_id))];
  if (!pendingIds.length) return [];
  const meetings = await supabase.from("agenda_events")
    .select("id,title,event_date,start_time,location")
    .in("id", pendingIds).eq("status", "scheduled")
    .eq("event_kind", "general").gte("event_date", today)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });
  if (meetings.error) throw new Error(meetings.error.message);
  return (meetings.data ?? []).map((item) => ({
    eventId: item.id,
    title: item.title,
    eventDate: item.event_date,
    startTime: trimDbTime(item.start_time),
    location: item.location,
  }));
}

export async function loadAgendaWorkspaceData(focusDate: string): Promise<AgendaWorkspaceData> {
  const supabase = createSupabaseServerClient();
  const today = todayInAgendaTimezone();
  const month = monthBounds(focusDate);
  const weekStart = startOfWeek(focusDate);
  const weekEnd = addDays(weekStart, 6);

  const { data: authData, error: userError } = await supabase.auth.getUser();
  const user = authData.user;
  if (userError || !user) throw new Error("Sessão inválida.");

  const permissionResults = await Promise.all([
    supabase.rpc("has_staff_module_access", { p_module: "agenda", p_write: false }),
    supabase.rpc("has_staff_module_access", { p_module: "agenda", p_write: true }),
    supabase.rpc("has_staff_module_access", { p_module: "pauta", p_write: false }),
    supabase.rpc("has_staff_module_access", { p_module: "pauta", p_write: true }),
  ]);
  const failedPermission = permissionResults.find((result) => result.error);
  if (failedPermission?.error) throw new Error(failedPermission.error.message);
  const access = {
    agendaRead: permissionResults[0].data === true,
    agendaWrite: permissionResults[1].data === true,
    pautaRead: permissionResults[2].data === true,
    pautaWrite: permissionResults[3].data === true,
    editorialLinkAccess: false,
  };
  if (!access.agendaRead && !access.pautaRead) redirect("/sistema");

  const periodResult = await supabase.from("pauta_week_overrides")
    .select("period_start,period_end,reason").eq("week_start", weekStart).maybeSingle();
  if (periodResult.error) throw new Error(periodResult.error.message);
  const periodStart = periodResult.data?.period_start ?? weekStart;
  const periodEnd = periodResult.data?.period_end ?? weekEnd;
  const eventRangeStart = periodStart < month.start ? periodStart : month.start;
  const eventRangeEnd = periodEnd > month.end ? periodEnd : month.end;

  const [profilesResult, eventsResult, pautaResult] = await Promise.all([
    supabase.from("profiles").select("id, name, role").eq("active", true).order("name", { ascending: true }),
    supabase
      .from("agenda_events")
      .select("id, title, description, event_date, start_time, end_time, location, status, reminder_minutes, event_kind, show_in_agenda, completed_at, updated_at")
      .gte("event_date", eventRangeStart)
      .lte("event_date", eventRangeEnd)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false }),
    supabase
      .from("weekly_pauta_items")
      .select("id, week_start, title, description, due_date, due_time, responsible_profile_id, agenda_event_id, article_id, status, completed_at, updated_at")
      .eq("week_start", weekStart)
      .order("status", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("due_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (pautaResult.error) throw new Error(pautaResult.error.message);

  const me = (profilesResult.data ?? []).find((profile) => profile.id === user.id);
  access.editorialLinkAccess = Boolean(me && (me.role === "owner" || me.role === "admin"));
  if (me?.role === "operator") {
    const visibility = await supabase.from("staff_module_visibility")
      .select("enabled").eq("profile_id", user.id).eq("module_key", "editorial").maybeSingle();
    access.editorialLinkAccess = !visibility.error && visibility.data?.enabled === true;
  }

  const profiles: AgendaProfile[] = (profilesResult.data ?? []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
  }));
  const profileName = new Map(profiles.map((profile) => [profile.id, profile.name]));

  const pendingInvitations = await loadMyPendingMeetingInvitations(supabase, user.id, today);
  const eventIds = (eventsResult.data ?? []).map((event) => event.id);

  // Coberturas usam o mesmo evento nas duas telas. As etapas não dependem
  // do status de presença de um compromisso comum.
  const coverageResult = eventIds.length
    ? await supabase.from("event_coverages")
      .select("event_id,attendance_owner_id,article_owner_id,attendance_status,attendance_at,article_status,article_completed_at,article_due_at,task_label,task_status,task_completed_at,audible_minutes,checkin_minutes,revision")
      .in("event_id",eventIds)
    : { data: [],error:null };
  if (coverageResult.error) throw new Error(coverageResult.error.message);
  const coverageIds = (coverageResult.data ?? []).map((v) => v.event_id);
  const transferResult = coverageIds.length
    ? await supabase.from("event_coverage_transfers")
      .select("id,event_id,transfer_part,to_profile_id,requested_by,reason")
      .in("event_id",coverageIds).eq("status","pending")
    : { data: [],error:null };
  if (transferResult.error) throw new Error(transferResult.error.message);
  const transferByEvent = new Map((transferResult.data ?? []).map((t) => [t.event_id,t]));
  const coverageByEvent = new Map<string,EventCoverage>();
  for(const row of coverageResult.data ?? []){
    const pending = transferByEvent.get(row.event_id);
    coverageByEvent.set(row.event_id,{
      eventId:row.event_id,
      attendanceOwnerId:row.attendance_owner_id,
      articleOwnerId:row.article_owner_id,
      attendanceStatus:row.attendance_status as EventCoverage["attendanceStatus"],
      attendanceAt:row.attendance_at,
      articleStatus:row.article_status as EventCoverage["articleStatus"],
      articleCompletedAt:row.article_completed_at,
      taskLabel:row.task_label,
      taskStatus:row.task_status as EventCoverage["taskStatus"],
      taskCompletedAt:row.task_completed_at,
      articleDueAt:row.article_due_at,
      audibleMinutes:row.audible_minutes,
      checkinMinutes:row.checkin_minutes,
      revision:row.revision,
      pendingTransfer:pending ? {
        id:pending.id,part:pending.transfer_part as "attendance"|"article"|"both",
        toProfileId:pending.to_profile_id,requestedBy:pending.requested_by,
        reason:pending.reason,
      }:null,
    });
  }

  let invitationRows: Array<{ event_id: string; profile_id: string; status: string; responded_at: string | null }> = [];
  if(eventIds.length){
    const invitations=await supabase.from("agenda_event_invitees")
      .select("event_id,profile_id,status,responded_at").in("event_id",eventIds);
    if(invitations.error)throw new Error(invitations.error.message);
    invitationRows=invitations.data??[];
  }
  let assignmentRows: Array<{ event_id: string; profile_id: string; completed_at: string | null; task_label: string | null }> = [];
  if (eventIds.length) {
    const assignments = await supabase
      .from("agenda_event_assignees")
      .select("event_id, profile_id, completed_at, task_label")
      .in("event_id", eventIds)
      .eq("assignment_type", "responsible");
    if (assignments.error) throw new Error(assignments.error.message);
    assignmentRows = assignments.data ?? [];
  }

  const assigneesByEvent = new Map<string, (AgendaProfile & { completedAt: string | null; taskLabel: string | null })[]>();
  for (const assignment of assignmentRows) {
    const profile = profiles.find((item) => item.id === assignment.profile_id);
    if (!profile) continue;
    const list = assigneesByEvent.get(assignment.event_id) ?? [];
    list.push({ ...profile, completedAt: assignment.completed_at, taskLabel: assignment.task_label });
    assigneesByEvent.set(assignment.event_id, list);
  }

  const inviteesByEvent=new Map<string,AgendaEventItem["invitees"]>();
  for(const row of invitationRows){
    const profile=profiles.find(p=>p.id===row.profile_id);
    if(!profile)continue;
    const invitation={
      ...profile,response:row.status as "pending"|"accepted"|"declined",
      respondedAt:row.responded_at,
    };
    const invitees=inviteesByEvent.get(row.event_id)??[];
    invitees.push(invitation);
    inviteesByEvent.set(row.event_id,invitees);
  }
  const events: AgendaEventItem[] = (eventsResult.data ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    eventDate: event.event_date,
    startTime: trimDbTime(event.start_time),
    endTime: trimDbTime(event.end_time),
    reminderMinutes: event.reminder_minutes,
    eventKind: event.event_kind as AgendaEventItem["eventKind"],
    showInAgenda: event.show_in_agenda,
    coverage: coverageByEvent.get(event.id) ?? null,
    completedAt: event.completed_at,
    updatedAt: event.updated_at,
    location: event.location,
    status: event.status as AgendaEventItem["status"],
    assignees: assigneesByEvent.get(event.id) ?? [],
    invitees: inviteesByEvent.get(event.id) ?? [],
  }));
  const eventById = new Map(events.map((event) => [event.id, event]));

  const pautaItems: WeeklyPautaItem[] = (pautaResult.data ?? []).map((item) => {
    const linked = item.agenda_event_id ? eventById.get(item.agenda_event_id) : undefined;
    const responsible = linked?.assignees.find((person) => person.id === item.responsible_profile_id) ?? linked?.assignees[0];
    return {
    id: item.id,
    // A pauta pertence à semana editorial em que foi criada, inclusive nas exceções.
    weekStart: item.week_start,
    title: linked?.title ?? item.title,
    description: linked?.description ?? item.description,
    dueDate: linked?.eventDate ?? item.due_date,
    dueTime: linked?.startTime ?? trimDbTime(item.due_time),
    responsibleProfileId: responsible?.id ?? item.responsible_profile_id,
    responsibleName: responsible?.name ?? (item.responsible_profile_id ? profileName.get(item.responsible_profile_id) ?? null : null),
    agendaEventId: item.agenda_event_id,
    agendaEventTitle: linked?.title ?? null,
    coverage: linked?.coverage ?? (item.agenda_event_id ? coverageByEvent.get(item.agenda_event_id) ?? null : null),
    articleId: item.article_id,
    status: linked ? (linked.status === "scheduled" ? "pending" : linked.status) : item.status as WeeklyPautaItem["status"],
    completedAt: linked?.completedAt ?? item.completed_at,
    assignees: linked?.assignees ?? [],
    updatedAt: linked?.updatedAt ?? item.updated_at,
  };
  });

  return {
    focusDate,
    today,
    monthStart: month.start,
    monthEnd: month.end,
    weekStart,
    weekEnd,
    periodStart,
    periodEnd,
    periodReason: periodResult.data?.reason ?? null,
    periodEdited: Boolean(periodResult.data),
    currentUserId: user.id,
    access,
    profiles,
    events,
    pendingInvitations,
    pautaItems,
  };
}
