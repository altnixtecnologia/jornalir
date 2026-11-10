import "server-only";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../lib/supabase/server";
import type { AgendaEventItem, AgendaProfile, AgendaWorkspaceData, CoverageTeamMember, CoverageTeamTransfer, EventCoverage, PendingMeetingInvitation, WeeklyPautaItem } from "./agendaTypes";
import { startOfPautaWeek } from "./pautaPeriod";
import { automaticPautaEditionNumber } from "./pautaEdition";

export const AGENDA_TIMEZONE = "America/Sao_Paulo";
const EVENT_COLUMNS = "id, title, description, event_date, start_time, end_time, location, status, reminder_minutes, event_kind, show_in_agenda, completed_at, updated_at, workflow_kind, council_city, article_owner_id, article_due_at, article_due_time_explicit, article_completed_at, article_completed_by, workflow_closed_at, workflow_closed_by";

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
    supabase.rpc("is_agenda_manager"),
    supabase.rpc("can_manage_editorial_workflow"),
  ]);
  const failedPermission = permissionResults.find((result) => result.error);
  if (failedPermission?.error) throw new Error(failedPermission.error.message);
  const access = {
    agendaRead: permissionResults[0].data === true,
    agendaWrite: permissionResults[1].data === true,
    pautaRead: permissionResults[2].data === true,
    pautaWrite: permissionResults[3].data === true,
    editorialLinkAccess: false,
    coverageManage: permissionResults[4].data === true,
    workflowManage: permissionResults[5].data === true,
  };
  if (!access.agendaRead && !access.pautaRead) redirect("/sistema");

  const [periodResult,editionResult] = await Promise.all([
    supabase.from("pauta_week_overrides")
      .select("period_start,period_end,reason").eq("week_start",weekStart).maybeSingle(),
    supabase.from("pauta_edition_overrides")
      .select("edition_number").eq("week_start",weekStart).maybeSingle(),
  ]);
  if (periodResult.error) throw new Error(periodResult.error.message);
  if (editionResult.error) throw new Error(editionResult.error.message);
  const periodStart = periodResult.data?.period_start ?? weekStart;
  const periodEnd = periodResult.data?.period_end ?? weekEnd;
  const eventRangeStart = periodStart < month.start ? periodStart : month.start;
  const eventRangeEnd = periodEnd > month.end ? periodEnd : month.end;

  const [profilesResult, eventsResult, pautaResult] = await Promise.all([
    supabase.from("profiles").select("id, name, role").eq("active", true).order("name", { ascending: true }),
    supabase
      .from("agenda_events")
      .select(EVENT_COLUMNS)
      .gte("event_date", eventRangeStart)
      .lte("event_date", eventRangeEnd)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false }),
    supabase
      .from("weekly_pauta_items")
      .select("id, week_start, title, description, due_date, due_time, responsible_profile_id, agenda_event_id, article_id, status, completed_at, updated_at")
      .eq("week_start", weekStart)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (pautaResult.error) throw new Error(pautaResult.error.message);

  // O período editorial pode mudar sem alterar a data do compromisso original.
  // Por isso, recuperar eventos ligados à Pauta mesmo fora do mês visível.
  const currentIds = new Set((eventsResult.data ?? []).map(event=>event.id));
  const missingIds=[...new Set((pautaResult.data??[])
    .map(item=>item.agenda_event_id).filter((id):id is string=>Boolean(id)&&!currentIds.has(id!)))];
  let eventRows=[...(eventsResult.data??[])];
  if(missingIds.length){
    const additional=await supabase.from("agenda_events").select(EVENT_COLUMNS).in("id",missingIds);
    if(additional.error)throw new Error(additional.error.message);
    eventRows=[...eventRows,...(additional.data??[])];
  }

  // Recuperar compromissos anteriores ainda agendados, inclusive fora do mes.
  // A paginacao evita que o limite padrao do Supabase oculte atrasos.
  const knownEventIds = new Set(eventRows.map((event) => event.id));
  for (let offset = 0; ; offset += 500) {
    const older = await supabase.from("agenda_events")
      .select(EVENT_COLUMNS)
      .eq("show_in_agenda", true)
      .eq("status", "scheduled")
      .lt("event_date", today)
      .order("event_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (older.error) throw new Error(older.error.message);
    const rows = older.data ?? [];
    for (const item of rows) {
      if (knownEventIds.has(item.id)) continue;
      knownEventIds.add(item.id);
      eventRows.push(item);
    }
    if (rows.length < 500) break;
  }
  // O indicador "Hoje" acompanha a data atual mesmo se outro mes for exibido.
  if (today < eventRangeStart || today > eventRangeEnd) {
    const todayEvents = await supabase.from("agenda_events")
      .select(EVENT_COLUMNS).eq("show_in_agenda", true).eq("event_date", today);
    if (todayEvents.error) throw new Error(todayEvents.error.message);
    for (const item of todayEvents.data ?? []) {
      if (knownEventIds.has(item.id)) continue;
      knownEventIds.add(item.id);
      eventRows.push(item);
    }
  }

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
  const eventIds = eventRows.map(event=>event.id);
  const pautaIds = (pautaResult.data??[]).map(item=>item.id);
  const [linksForPauta,linksForEvents]=await Promise.all([
    pautaIds.length?supabase.from("pauta_agenda_appointments")
      .select("pauta_id,profile_id,event_id").in("pauta_id",pautaIds)
      :Promise.resolve({data:[],error:null}),
    eventIds.length?supabase.from("pauta_agenda_appointments")
      .select("pauta_id,profile_id,event_id").in("event_id",eventIds)
      :Promise.resolve({data:[],error:null}),
  ]);
  if(linksForPauta.error)throw new Error(linksForPauta.error.message);
  if(linksForEvents.error)throw new Error(linksForEvents.error.message);
  const linkRows=[...new Map([...(linksForPauta.data??[]),...(linksForEvents.data??[])]
    .map(row=>[row.event_id,row])).values()];
  const appointmentByEvent=new Map(linkRows.map(row=>[row.event_id,row]));
  const appointmentIds=linkRows.map(row=>row.event_id);
  const appointmentDateResult=appointmentIds.length
    ?await supabase.from("agenda_events").select("id,event_date,start_time").in("id",appointmentIds)
    :{data:[],error:null};
  if(appointmentDateResult.error)throw new Error(appointmentDateResult.error.message);
  const appointmentDateById=new Map((appointmentDateResult.data??[])
    .map(row=>[row.id,row]));
  const appointmentsByPauta=new Map<string,WeeklyPautaItem["appointments"]>();
  for(const entry of linkRows){
    const date=appointmentDateById.get(entry.event_id);
    if(!date)continue;
    const list=appointmentsByPauta.get(entry.pauta_id)??[];
    list.push({profileId:entry.profile_id,personName:profileName.get(entry.profile_id)??"Colaborador",
      eventId:entry.event_id,eventDate:date.event_date,startTime:trimDbTime(date.start_time)});
    appointmentsByPauta.set(entry.pauta_id,list);
  }

  // Coberturas usam o mesmo evento nas duas telas. As etapas não dependem
  // do status de presença de um compromisso comum.
  const coverageResult = eventIds.length
    ? await supabase.from("event_coverages")
      .select("event_id,attendance_owner_id,article_owner_id,attendance_status,attendance_at,article_status,article_completed_at,article_due_at,task_label,task_status,task_completed_at,team_mode,audible_minutes,checkin_minutes,revision")
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
  const teamEventIds=(coverageResult.data??[]).filter(v=>v.team_mode).map(v=>v.event_id);
  const [membersResult,teamTransfersResult,tasksResult]=await Promise.all([
    teamEventIds.length?supabase.from("event_coverage_members")
      .select("event_id,profile_id,field_task,field_completed_at,attendance_response,attendance_responded_at")
      .in("event_id",teamEventIds):Promise.resolve({data:[],error:null}),
    teamEventIds.length?supabase.from("event_coverage_member_transfers")
      .select("id,event_id,from_profile_id,to_profile_id,transfer_part,reason,requested_by")
      .in("event_id",teamEventIds).eq("status","pending"):Promise.resolve({data:[],error:null}),
    teamEventIds.length?supabase.from("event_coverage_member_tasks")
      .select("id,event_id,profile_id,task_kind,task_label,completed_at,completed_by")
      .in("event_id",teamEventIds).order("created_at",{ascending:true})
      :Promise.resolve({data:[],error:null}),
  ]);
  if(membersResult.error)throw new Error(membersResult.error.message);
  if(teamTransfersResult.error)throw new Error(teamTransfersResult.error.message);
  if(tasksResult.error)throw new Error(tasksResult.error.message);
  const tasksByPerson=new Map<string,CoverageTeamMember["tasks"]>();
  for(const entry of tasksResult.data??[]){
    const key=entry.event_id+":"+entry.profile_id;
    const list=tasksByPerson.get(key)??[];
    list.push({
      id:entry.id,kind:entry.task_kind as CoverageTeamMember["tasks"][number]["kind"],
      label:entry.task_label,completedAt:entry.completed_at,completedBy:entry.completed_by,
    });
    tasksByPerson.set(key,list);
  }
  const membersByEvent=new Map<string,CoverageTeamMember[]>();
  for(const entry of membersResult.data??[]){
    const list=membersByEvent.get(entry.event_id)??[];
    list.push({
      profileId:entry.profile_id,fieldTask:entry.field_task,
      fieldCompletedAt:entry.field_completed_at,
      tasks:tasksByPerson.get(entry.event_id+":"+entry.profile_id)??[],
      attendanceResponse:entry.attendance_response as CoverageTeamMember["attendanceResponse"],
      attendanceRespondedAt:entry.attendance_responded_at,
    });
    membersByEvent.set(entry.event_id,list);
  }
  const teamTransfersByEvent=new Map<string,CoverageTeamTransfer[]>();
  for(const entry of teamTransfersResult.data??[]){
    const list=teamTransfersByEvent.get(entry.event_id)??[];
    list.push({
      id:entry.id,fromProfileId:entry.from_profile_id,toProfileId:entry.to_profile_id,
      part:entry.transfer_part as CoverageTeamTransfer["part"],
      reason:entry.reason,requestedBy:entry.requested_by,
    });
    teamTransfersByEvent.set(entry.event_id,list);
  }

  const coverageByEvent = new Map<string,EventCoverage>();
  for(const row of coverageResult.data ?? []){
    const pending = transferByEvent.get(row.event_id);
    coverageByEvent.set(row.event_id,{
      eventId:row.event_id,
      teamMode:row.team_mode,
      members:membersByEvent.get(row.event_id)??[],
      pendingTeamTransfers:teamTransfersByEvent.get(row.event_id)??[],
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
  let assignmentRows: Array<{
 event_id:string;profile_id:string;completed_at:string|null;task_label:string|null;
 workflow_tasks:unknown;attendance_response:string;attendance_responded_at:string|null;
 attendance_marked_by:string|null;
}> = [];
  if (eventIds.length) {
    const assignments = await supabase
      .from("agenda_event_assignees")
      .select("event_id, profile_id, completed_at, task_label, workflow_tasks, attendance_response, attendance_responded_at, attendance_marked_by")
      .in("event_id", eventIds)
      .eq("assignment_type", "responsible");
    if (assignments.error) throw new Error(assignments.error.message);
    assignmentRows = assignments.data ?? [];
  }

  const assigneesByEvent = new Map<string, AgendaEventItem["assignees"]>();
  for (const assignment of assignmentRows) {
    const profile = profiles.find((item) => item.id === assignment.profile_id);
    if (!profile) continue;
    const list = assigneesByEvent.get(assignment.event_id) ?? [];
    const tasks=Array.isArray(assignment.workflow_tasks)?assignment.workflow_tasks:[];
    list.push({
      ...profile,completedAt:assignment.completed_at,taskLabel:assignment.task_label,
      workflowTasks:tasks.filter((item:unknown)=>Boolean(item&&typeof item==="object")).map((item)=>{
        const data=item as {kind?:string;label?:string};
        return {kind:(data.kind??"custom") as AgendaEventItem["assignees"][number]["workflowTasks"][number]["kind"],label:String(data.label??"")};
      }),
      attendanceResponse:assignment.attendance_response as AgendaEventItem["assignees"][number]["attendanceResponse"],
      attendanceRespondedAt:assignment.attendance_responded_at,
      attendanceMarkedBy:assignment.attendance_marked_by,
    });
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
  const events: AgendaEventItem[] = eventRows.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    eventDate: event.event_date,
    startTime: trimDbTime(event.start_time),
    endTime: trimDbTime(event.end_time),
    reminderMinutes: event.reminder_minutes,
    eventKind:event.event_kind as AgendaEventItem["eventKind"],
    workflowKind:event.workflow_kind as AgendaEventItem["workflowKind"],
    councilCity:event.council_city,
    articleOwnerId:event.article_owner_id,
    articleDueAt:event.article_due_at,
    articleDueTimeExplicit:Boolean(event.article_due_time_explicit),
    articleCompletedAt:event.article_completed_at,
    articleCompletedBy:event.article_completed_by,
    workflowClosedAt:event.workflow_closed_at,
    workflowClosedBy:event.workflow_closed_by,
    showInAgenda: event.show_in_agenda,
    appointmentPautaId: appointmentByEvent.get(event.id)?.pauta_id ?? null,
    appointmentOwnerId: appointmentByEvent.get(event.id)?.profile_id ?? null,
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
    dueDate: item.due_date,
    dueTime: trimDbTime(item.due_time),
    responsibleProfileId: responsible?.id ?? item.responsible_profile_id,
    responsibleName: responsible?.name ?? (item.responsible_profile_id ? profileName.get(item.responsible_profile_id) ?? null : null),
    agendaEventId: item.agenda_event_id,
    agendaEventTitle: linked?.title ?? null,
    coverage: linked?.coverage ?? (item.agenda_event_id ? coverageByEvent.get(item.agenda_event_id) ?? null : null),
    workflow:linked?.workflowKind!=="general"?linked??null:null,
    articleId: item.article_id,
    appointments: appointmentsByPauta.get(item.id)??[],
    // Exclusão só da Pauta jamais cancela compromisso original da Agenda.
    status: item.status==="cancelled"?"cancelled":linked?.coverage?.teamMode
      ? item.status as WeeklyPautaItem["status"]
      : linked ? (linked.status === "scheduled" ? "pending" : linked.status)
      : item.status as WeeklyPautaItem["status"],
    completedAt: linked?.coverage?.teamMode ? item.completed_at : linked?.completedAt ?? item.completed_at,
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
    editionNumber:editionResult.data?.edition_number??automaticPautaEditionNumber(weekStart),
    editionEdited:Boolean(editionResult.data),
    currentUserId: user.id,
    access,
    profiles,
    events,
    pendingInvitations,
    pautaItems,
  };
}
