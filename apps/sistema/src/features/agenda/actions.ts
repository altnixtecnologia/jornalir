"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { addDays, startOfWeek } from "./agendaData";
import { dateInPautaPeriod } from "./pautaPeriod";
import { coverageMinutesBefore } from "./coverageClock";
import { validateCoverageTasks } from "./coverageTaskCatalog";

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
  if (dueDate && !validDate(dueDate)) return { error: "Data inválida para a pauta." };
  if (!dueDate) return { error: "Escolha uma data para a pauta." };
  if (!validTime(dueTime)) return { error: "Horário inválido." };
  if (description.length > 4000) return { error: "Observação muito longa." };
  return { title, weekStart, dueDate, dueTime, description, assigneeIds };
}

function refreshAgenda(): void {
  revalidatePath("/sistema/agenda");
  revalidatePath("/sistema/pauta");
  revalidatePath("/agenda");
}

async function checkPautaPeriod(supabase: SupabaseClient, anchor: string, day: string): Promise<void> {
  const { data, error } = await supabase.from("pauta_week_overrides")
    .select("period_start,period_end").eq("week_start", anchor).maybeSingle();
  if (error) throw new Error(error.message);
  const periodStart = data?.period_start ?? anchor;
  const periodEnd = data?.period_end ?? addDays(anchor, 6);
  if (!dateInPautaPeriod(day, periodStart, periodEnd)) {
    throw new Error("A data deve estar dentro do período da Pauta selecionada.");
  }
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

async function preserveCoverageAssignees(
 supabase:SupabaseClient,eventId:string,proposed:string[],
):Promise<string[]>{
 const {data:coverage,error}=await supabase.from("event_coverages")
   .select("attendance_owner_id,article_owner_id").eq("event_id",eventId).maybeSingle();
 if(error)throw new Error(error.message);
 if(!coverage)return proposed;
 // O formulário geral oculta a edição dos titulares: não apagá-los
 // acidentalmente ao mudar título, local ou horário.
 const current=await supabase.from("agenda_event_assignees")
   .select("profile_id").eq("event_id",eventId).eq("assignment_type","responsible");
 if(current.error)throw new Error(current.error.message);
 return [...new Set([
   ...(current.data??[]).map(v=>v.profile_id),
   coverage.attendance_owner_id,coverage.article_owner_id,
 ])];
}

function coveragePeople(form:FormData,eventStartTime:string):
  | {attendanceOwner:string;articleOwner:string;audible:number;checkin:number;taskLabel:string}
  | {error:string} {
  const attendanceOwner=value(form,"coverage_attendance_owner");
  const articleOwner=value(form,"coverage_article_owner")||attendanceOwner;
  if(!/^[a-f0-9-]{36}$/i.test(attendanceOwner)||!/^[a-f0-9-]{36}$/i.test(articleOwner)){
    return {error:"Selecione quem fará a cobertura e quem produzirá a matéria."};
  }
  const audibleClock=value(form,"coverage_audible_time");
  const checkinClock=value(form,"coverage_checkin_time");
  const audible=coverageMinutesBefore(eventStartTime,audibleClock);
  const checkin=coverageMinutesBefore(eventStartTime,checkinClock);
  if(audible===null||checkin===null||audible< -1440||audible>1440||checkin< -120||checkin>120){
    return {error:"Confira os horários. A confirmação silenciosa deve ficar a até duas horas do evento."};
  }
  const taskLabel=value(form,"coverage_task_label")||"Fotos / cobertura";
  if(taskLabel.length<2||taskLabel.length>80)return {error:"Descreva a tarefa de campo em até 80 caracteres."};
  return {attendanceOwner,articleOwner,audible,checkin,taskLabel};
}

/** Equipe livre de 1 a 16 pessoas; validada novamente pela RPC no Postgres. */
function coverageTeamPeople(form:FormData,eventTime:string):
 | {staff:{profileId:string;task:string;tasks:NonNullable<ReturnType<typeof validateCoverageTasks>>}[];
    articleOwner:string;audible:number;checkin:number}
 | {error:string}{
 let staff:unknown;
 try{staff=JSON.parse(value(form,"coverage_team_json"));}
 catch{return {error:"Adicione os colaboradores da cobertura."};}
 if(!Array.isArray(staff)||staff.length<1||staff.length>16)
  return {error:"Informe entre 1 e 16 colaboradores de campo."};
 const uuid=/^[a-f0-9-]{36}$/i;
 const clean:{profileId:string;task:string;tasks:NonNullable<ReturnType<typeof validateCoverageTasks>>}[]=[];
 for(const item of staff){
  if(!item||typeof item!=="object")return {error:"Equipe inválida."};
  const row=item as Record<string,unknown>;
  const profileId=typeof row.profileId==="string"?row.profileId:"";
  const tasks=validateCoverageTasks(row.tasks);
  if(!uuid.test(profileId)||!tasks)
   return {error:"Selecione cada colaborador e de 1 a 8 tarefas válidas."};
  clean.push({profileId,task:tasks[0].label,tasks});
 }
 if(new Set(clean.map(x=>x.profileId)).size!==clean.length)
  return {error:"Cada colaborador deve ser selecionado uma única vez."};
 const articleOwner=value(form,"coverage_article_owner");
 if(!uuid.test(articleOwner))return {error:"Escolha o responsável pela matéria."};
 const audible=coverageMinutesBefore(eventTime,value(form,"coverage_audible_time"));
 const checkin=coverageMinutesBefore(eventTime,value(form,"coverage_checkin_time"));
 if(audible===null||checkin===null||audible< -1440||audible>1440||checkin< -120||checkin>120)
  return {error:"Confira os horários de aviso e confirmação."};
 return {staff:clean,articleOwner,audible,checkin};
}

async function coverageStartTime(client:SupabaseClient,eventId:string):Promise<string>{
  const result=await client.from("agenda_events").select("start_time").eq("id",eventId).maybeSingle();
  if(result.error||!result.data?.start_time)throw new Error(result.error?.message||"O evento precisa ter horário de início.");
  return result.data.start_time.slice(0,5);
}

/** Fluxo simplificado novo: um formulário para Evento, Câmara, Visita ou Só matéria. */
export async function createEditorialWorkflowAction(form:FormData):Promise<AgendaActionResult>{
 const kind=value(form,"workflow_kind");
 const title=value(form,"title");
 const eventDate=value(form,"event_date");
 const startTime=value(form,"start_time");
 const endTime=value(form,"end_time");
 const dueDate=value(form,"article_due_date");
 const dueTime=value(form,"article_due_time");
 const weekStart=value(form,"week_start");
 const city=value(form,"council_city");
 const description=value(form,"description");
 const location=value(form,"location");
 const writer=value(form,"workflow_writer");
 const recurrence=Number(value(form,"council_repeat")||"1");
 if(!["event","council","visit","article"].includes(kind))return {error:"Selecione Evento, Sessão da Câmara, Visita ou Só matéria."};
 if(title.length<1||title.length>180||description.length>4000||location.length>240)
  return {error:"Informe um título válido e confira a descrição."};
 if(kind!=="article"&&!validDate(eventDate))return {error:"Informe o dia do compromisso."};
 if(!validTime(startTime)||!validTime(endTime)||startTime&&endTime&&endTime<startTime)
  return {error:"Confira os horários do compromisso."};
 if(dueDate&&!validDate(dueDate))return {error:"Data de entrega da matéria inválida."};
 if(!validTime(dueTime)||dueTime&&!dueDate)
  return {error:"Selecione a data do prazo ou limpe a hora com X."};
 if(!validDate(weekStart)||startOfWeek(weekStart)!==weekStart)return {error:"Semana editorial inválida."};
 if(kind==="council"&&![
  "Morrinhos do Sul/RS","Mampituba/RS","Praia Grande/SC","São João do Sul/SC",
  "Santa Rosa do Sul/SC","Torres/RS","Passo de Torres/SC"
 ].includes(city))return {error:"Escolha o município da Câmara."};
 if(![1,4,12].includes(recurrence)||(kind!=="council"&&recurrence!==1))
  return {error:"Repetição de sessão inválida."};
 let input:unknown;
 try{input=JSON.parse(value(form,"workflow_crew_json"));}
 catch{return {error:"Selecione a equipe."};}
 if(!Array.isArray(input)||input.length<1||input.length>16)
  return {error:"Escolha entre 1 e 16 colaboradores."};
 const ids=new Set<string>();
 const crew:{profileId:string;attends:boolean;tasks:NonNullable<ReturnType<typeof validateCoverageTasks>>}[]=[];
 for(const item of input){
  if(!item||typeof item!=="object")return {error:"Equipe inválida."};
  const person=item as {profileId?:unknown;attends?:unknown;tasks?:unknown};
  const id=person.profileId;
  const tasks=person.tasks===undefined||Array.isArray(person.tasks)&&person.tasks.length===0
     ? [] :validateCoverageTasks(person.tasks);
  if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id)||ids.has(id)||!tasks)
    return {error:"Equipe com colaborador ou tarefa duplicada/inválida."};
  ids.add(id);
  crew.push({profileId:id,attends:kind!=="article"&&person.attends!==false,tasks});
 }
 if(kind==="article"&&crew.length!==1)return {error:"Só matéria precisa de um responsável."};
 if(kind==="article"&&!writer)return {error:"Escolha o responsável pela matéria."};
 if(writer&&!ids.has(writer))return {error:"Marque Matéria em um dos colaboradores."};
 try{
   const {supabase}=await requireActiveUser();
   await validateActiveProfiles(supabase,[...ids]);
   const {data,error}=await supabase.rpc("create_editorial_workflow",{
     p_kind:kind,p_title:title,p_description:description||null,
     p_event_date:kind==="article"?null:eventDate,
     p_start_time:kind==="article"?null:startTime||null,
     p_end_time:kind==="article"?null:endTime||null,
     p_location:location||null,p_week_start:weekStart,
     p_city:kind==="council"?city:null,
     p_crew:crew,p_writer:writer||null,
     p_due_date:writer&&dueDate?dueDate:null,
     p_due_time:writer&&dueTime?dueTime:null,
     p_repeat:recurrence,
   });
   if(error||Number(data)!==recurrence)return {error:error?.message??"Não foi possível criar os compromissos."};
   refreshAgenda();return {ok:true};
 }catch(err){return {error:err instanceof Error?err.message:"Falha ao cadastrar."};}
}

export async function answerEditorialWorkflowPresenceAction(
 eventId:string,profileId:string,answer:"present"|"absent"|"not_required"
):Promise<AgendaActionResult>{
 if(!/^[a-f0-9-]{36}$/i.test(eventId)||!/^[a-f0-9-]{36}$/i.test(profileId)||
   !["present","absent","not_required"].includes(answer))
   return {error:"Resposta inválida."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("answer_editorial_workflow_presence",{
   p_event_id:eventId,p_profile_id:profileId,p_answer:answer,
  });
  if(error||!data)return {error:error?.message??"Não foi possível registrar a participação."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao responder."};}
}

export async function closeEditorialWorkflowAction(
 eventId:string,complete:boolean
):Promise<AgendaActionResult>{
 if(!/^[a-f0-9-]{36}$/i.test(eventId))return {error:"Compromisso inválido."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("close_editorial_workflow",{
   p_event_id:eventId,p_completed:complete,
  });
  if(error||!data)return {error:error?.message??"Não foi possível encerrar."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao concluir."};}
}

export async function updateEditorialWorkflowDeadlineAction(
 eventId:string,form:FormData
):Promise<AgendaActionResult>{
 const date=value(form,"article_due_date"),time=value(form,"article_due_time");
 if(!/^[a-f0-9-]{36}$/i.test(eventId)||date&&!validDate(date)||!validTime(time)||time&&!date)
  return {error:"Confira a data e a hora, ou deixe ambas vazias."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("update_editorial_workflow_deadline",{
    p_event_id:eventId,p_due_date:date||null,p_due_time:time||null,
  });
  if(error||!data)return {error:error?.message??"Não foi possível alterar o prazo."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao alterar o prazo."};}
}

export async function createAgendaEventAction(formData: FormData): Promise<AgendaActionResult> {
  const input = validateEventPayload(formData);
  if ("error" in input) return input;

  try {
    const { supabase } = await requireActiveUser();
    await validateActiveProfiles(supabase, input.assigneeIds);
    if(value(formData,"coverage_enabled")==="true"){
      if(!input.startTime)return {error:"Cobertura de evento precisa do horário de início."};
      if(value(formData,"recurrence") && value(formData,"recurrence")!=="none")
        return {error:"Crie uma cobertura por evento; recorrência não está habilitada."};
      const people=coverageTeamPeople(formData,input.startTime);
      if("error" in people)return people;
      await validateActiveProfiles(supabase,[...people.staff.map(x=>x.profileId),people.articleOwner]);
      const created=await supabase.rpc("create_coverage_team_agenda",{
        p_title:input.title,p_description:input.description||null,p_event_date:input.eventDate,
        p_start_time:input.startTime,p_end_time:input.endTime||null,p_location:input.location||null,
        p_staff:people.staff,p_article_owner:people.articleOwner,
        p_audible:people.audible,p_checkin:people.checkin,
      });
      if(created.error || !created.data)return {error:created.error?.message??"Não foi possível criar a cobertura."};
      refreshAgenda();
      return {ok:true};
    }
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
    const safeIds=await preserveCoverageAssignees(supabase,eventId,input.assigneeIds);
    await validateActiveProfiles(supabase, safeIds);
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
      p_profile_ids: safeIds,
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
    await checkPautaPeriod(supabase, input.weekStart, input.dueDate);
    if(value(formData,"coverage_enabled")==="true"){
      if(!input.dueTime)return {error:"Informe o horário do evento para programar os lembretes."};
      const people=coverageTeamPeople(formData,input.dueTime);
      if("error" in people)return people;
      await validateActiveProfiles(supabase,[...people.staff.map(x=>x.profileId),people.articleOwner]);
      const result=await supabase.rpc("create_coverage_team_pauta",{
        p_title:input.title,p_description:input.description||null,p_event_date:input.dueDate,
        p_start_time:input.dueTime,p_week_start:input.weekStart,
        p_show_in_agenda:value(formData,"show_in_agenda")==="true",
        p_staff:people.staff,p_article_owner:people.articleOwner,
        p_audible:people.audible,p_checkin:people.checkin,
      });
      if(result.error||!result.data)return {error:result.error?.message??"Não foi possível criar a cobertura."};
      refreshAgenda();
      return {ok:true};
    }
    const { data, error } = await supabase.rpc("create_editorial_pauta_in_period", {
      p_title: input.title,
      p_description: input.description || null,
      p_event_date: input.dueDate,
      p_start_time: input.dueTime || null,
      p_profile_ids: input.assigneeIds,
      p_week_start: input.weekStart,
      p_show_in_agenda: value(formData, "show_in_agenda") === "true",
    });
    if (error || !data) return { error: error?.message ?? "Não foi possível criar a pauta." };
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
    const eventLink=await supabase.from("weekly_pauta_items")
      .select("agenda_event_id").eq("id",itemId).maybeSingle();
    if(eventLink.error||!eventLink.data?.agenda_event_id)
      return {error:eventLink.error?.message??"Compromisso da Pauta indisponível."};
    const safeIds=await preserveCoverageAssignees(supabase,eventLink.data.agenda_event_id,input.assigneeIds);
    await validateActiveProfiles(supabase, safeIds);
    const existing = await supabase.from("weekly_pauta_items")
      .select("week_start").eq("id", itemId).maybeSingle();
    if (existing.error || !existing.data || existing.data.week_start !== input.weekStart) {
      return { error: "Esta pauta mudou de semana. Atualize a página antes de editar." };
    }
    await checkPautaPeriod(supabase, input.weekStart, input.dueDate);
    const { data, error } = await supabase.rpc("update_editorial_pauta_event", {
      p_pauta_id: itemId,
      p_title: input.title,
      p_description: input.description || null,
      p_event_date: input.dueDate,
      p_start_time: input.dueTime || null,
      p_profile_ids: safeIds,
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

/** Exceção de período: altera a semana escolhida para toda a equipe, com auditoria. */
export async function savePautaPeriodAction(formData: FormData): Promise<AgendaActionResult> {
  const weekStart = value(formData, "week_start");
  const periodStart = value(formData, "period_start");
  const periodEnd = value(formData, "period_end");
  const reason = value(formData, "reason");
  if (!validDate(weekStart) || startOfWeek(weekStart) !== weekStart ||
      !validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) {
    return { error: "Confira as datas do período." };
  }
  if ((periodStart !== weekStart || periodEnd !== addDays(weekStart, 6)) &&
      (reason.length < 5 || reason.length > 300)) {
    return { error: "Informe o motivo da alteração (5 a 300 caracteres)." };
  }
  try {
    const { supabase } = await requireActiveUser();
    const { data, error } = await supabase.rpc("save_pauta_week_override", {
      p_week_start: weekStart,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_reason: reason,
    });
    if (error || !data) return { error: error?.message ?? "Não foi possível alterar a semana." };
    refreshAgenda();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar o período." };
  }
}


/** Vincular uma cobertura a compromisso/pauta existente (sem duplicar agenda). */
export async function enableCoverageAction(eventId:string,formData:FormData):Promise<AgendaActionResult>{
  if(!eventId)return {error:"Compromisso não identificado."};
  try{
    const {supabase}=await requireActiveUser();
    const people=coverageTeamPeople(formData,await coverageStartTime(supabase,eventId));
    if("error" in people)return people;
    await validateActiveProfiles(supabase,[...people.staff.map(x=>x.profileId),people.articleOwner]);
    const {data,error}=await supabase.rpc("create_coverage_team",{
      p_event_id:eventId,p_staff:people.staff,p_article_owner:people.articleOwner,
      p_audible:people.audible,p_checkin:people.checkin,
    });
    if(error||!data)return {error:error?.message??"Não foi possível configurar a cobertura."};
    refreshAgenda();return {ok:true};
  }catch(error){return {error:error instanceof Error?error.message:"Falha na cobertura."};}
}


/** A presença termina na Agenda; a entrega continua independente na Pauta. */
export async function answerCoverageAttendanceAction(
 eventId:string,answer:"present"|"not_required"|"unable",
):Promise<AgendaActionResult>{
 if(!eventId||!["present","not_required","unable"].includes(answer))return {error:"Resposta inválida."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("set_coverage_member_attendance",{p_event_id:eventId,p_answer:answer});
  if(error||!data)return {error:error?.message??"Não foi possível registrar sua resposta."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao registrar presença."};}
}

export async function finishCoverageTeamTaskAction(
 eventId:string,complete:boolean,
):Promise<AgendaActionResult>{
 if(!eventId)return {error:"Evento inválido."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("set_coverage_member_task",{
   p_event_id:eventId,p_completed:complete,
  });
  if(error||!data)return {error:error?.message??"Não foi possível atualizar sua tarefa."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha na conclusão."};}
}

export async function addCoverageTeamMemberAction(
 eventId:string,formData:FormData,
):Promise<AgendaActionResult>{
 const person=value(formData,"team_new_person");
 const task=value(formData,"team_new_task");
 if(!eventId||!/^[a-f0-9-]{36}$/i.test(person)||task.length<2||task.length>80)
  return {error:"Selecione o colaborador e descreva sua tarefa."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("add_coverage_team_member",{
   p_event_id:eventId,p_profile_id:person,p_field_task:task,
  });
  if(error||!data)return {error:error?.message??"Não foi possível adicionar colaborador."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao adicionar colaborador."};}
}

export async function completeCoverageTaskAction(
 eventId:string,taskId:string,complete:boolean,
):Promise<AgendaActionResult>{
 if(!/^[a-f0-9-]{36}$/i.test(eventId)||!/^[a-f0-9-]{36}$/i.test(taskId))
  return {error:"Entrega não identificada."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("set_coverage_member_task_status",{
    p_task_id:taskId,p_completed:complete,
  });
  if(error||!data)return {error:error?.message??"Não foi possível atualizar a entrega."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao atualizar a entrega."};}
}

export async function assignCoverageTasksAction(
 eventId:string,form:FormData,
):Promise<AgendaActionResult>{
 const person=value(form,"team_new_person");
 let raw:unknown;
 try{raw=JSON.parse(value(form,"team_new_tasks_json"));}catch{return {error:"Selecione as tarefas do colaborador."};}
 const tasks=validateCoverageTasks(raw);
 if(!/^[a-f0-9-]{36}$/i.test(eventId)||!/^[a-f0-9-]{36}$/i.test(person)||!tasks)
  return {error:"Escolha o colaborador e até oito tarefas válidas."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("assign_coverage_member_tasks",{
   p_event_id:eventId,p_profile_id:person,p_tasks:tasks,
  });
  if(error||!data)return {error:error?.message??"Não foi possível atribuir as entregas."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao atribuir tarefas."};}
}

export async function requestCoverageTeamTransferAction(
 eventId:string,formData:FormData,
):Promise<AgendaActionResult>{
 const from=value(formData,"transfer_from");
 const to=value(formData,"transfer_to");
 const part=value(formData,"transfer_part");
 const reason=value(formData,"transfer_reason");
 const force=value(formData,"transfer_force")==="true";
 if(!eventId||!/^[a-f0-9-]{36}$/i.test(from)||!/^[a-f0-9-]{36}$/i.test(to)||
    !["field","article","both"].includes(part)||reason.length<5||reason.length>300)
  return {error:"Informe titular atual, novo titular e motivo."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("request_coverage_member_transfer",{
   p_event_id:eventId,p_from:from,p_to:to,p_part:part,p_reason:reason,p_force:force,
  });
  if(error||!data)return {error:error?.message??"Não foi possível solicitar a transferência."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha na transferência."};}
}

export async function respondCoverageTeamTransferAction(
 transferId:string,accept:boolean,
):Promise<AgendaActionResult>{
 if(!transferId)return {error:"Solicitação inválida."};
 try{
  const {supabase}=await requireActiveUser();
  const {data,error}=await supabase.rpc("respond_coverage_member_transfer",{
   p_transfer:transferId,p_accept:accept,
  });
  if(error||!data)return {error:error?.message??"Não foi possível responder à transferência."};
  refreshAgenda();return {ok:true};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao responder à transferência."};}
}

export async function requestCoverageTransferAction(eventId:string,formData:FormData):Promise<AgendaActionResult>{
  const part=value(formData,"transfer_part");
  const to=value(formData,"transfer_to");
  const reason=value(formData,"transfer_reason");
  const force=value(formData,"transfer_force")==="true";
  if(!eventId||!["attendance","article","both"].includes(part)
    ||!/^[a-f0-9-]{36}$/i.test(to)||reason.length<5||reason.length>300)
    return {error:"Escolha o novo responsável e informe o motivo (5 a 300 caracteres)."};
  try{
    const {supabase}=await requireActiveUser();
    const {data,error}=await supabase.rpc("request_event_coverage_transfer",{
      p_event_id:eventId,p_part:part,p_to:to,p_reason:reason,p_force:force,
    });
    if(error||!data)return {error:error?.message??"Não foi possível solicitar transferência."};
    refreshAgenda();return {ok:true};
  }catch(error){return {error:error instanceof Error?error.message:"Falha na transferência."};}
}

export async function respondCoverageTransferAction(transferId:string,accept:boolean):Promise<AgendaActionResult>{
  if(!transferId)return {error:"Transferência inválida."};
  try{
    const {supabase}=await requireActiveUser();
    const {data,error}=await supabase.rpc("respond_event_coverage_transfer",{p_transfer:transferId,p_accept:accept});
    if(error||!data)return {error:error?.message??"Não foi possível responder à transferência."};
    refreshAgenda();return {ok:true};
  }catch(error){return {error:error instanceof Error?error.message:"Falha ao confirmar transferência."};}
}

export async function markCoverageAttendanceAction(eventId:string,status:"on_way"|"present"|"absent"):Promise<AgendaActionResult>{
  if(!eventId || !["on_way","present","absent"].includes(status))return {error:"Comparecimento inválido."};
  try{
    const {supabase}=await requireActiveUser();
    const {data,error}=await supabase.rpc("mark_event_coverage_attendance",{p_event_id:eventId,p_status:status});
    if(error||!data)return {error:error?.message??"Não foi possível confirmar presença."};
    refreshAgenda();return {ok:true};
  }catch(error){return {error:error instanceof Error?error.message:"Falha na presença."};}
}

export async function saveAgendaAssigneeTaskAction(eventId:string,profileId:string,formData:FormData):Promise<AgendaActionResult>{
  const label=value(formData,"assignee_task_label");
  if(!eventId||!profileId||(label&& (label.length<2||label.length>80)))
    return {error:"Informe a função do colaborador em até 80 caracteres."};
  try{
    const {supabase}=await requireActiveUser();
    const {data,error}=await supabase.rpc("set_agenda_assignee_task_label",{
      p_event_id:eventId,p_profile_id:profileId,p_label:label,
    });
    if(error||!data)return {error:error?.message??"Não foi possível salvar a função."};
    refreshAgenda();return {ok:true};
  }catch(e){return {error:e instanceof Error?e.message:"Falha ao salvar a função."};}
}

export async function finishCoverageFieldTaskAction(eventId:string,complete:boolean):Promise<AgendaActionResult>{
  if(!eventId)return {error:"Cobertura inválida."};
  try {
    const {supabase}=await requireActiveUser();
    const {data,error}=await supabase.rpc("set_event_coverage_task",{p_event_id:eventId,p_completed:complete});
    if(error||!data)return {error:error?.message??"Não foi possível concluir a tarefa."};
    refreshAgenda();return {ok:true};
  }catch(e){return {error:e instanceof Error?e.message:"Falha na tarefa."};}
}

export async function saveCoverageTaskLabelAction(eventId:string,formData:FormData):Promise<AgendaActionResult>{
  const label=value(formData,"coverage_task_label");
  if(!eventId||label.length<2||label.length>80)return {error:"Informe a tarefa (2 a 80 caracteres)."};
  try {
    const {supabase}=await requireActiveUser();
    const {data,error}=await supabase.rpc("set_event_coverage_task_label",{p_event_id:eventId,p_label:label});
    if(error||!data)return {error:error?.message??"Não foi possível salvar a tarefa."};
    refreshAgenda();return {ok:true};
  }catch(e){return {error:e instanceof Error?e.message:"Falha ao editar a tarefa."};}
}

export async function finishCoverageArticleAction(eventId:string,complete:boolean):Promise<AgendaActionResult>{
  if(!eventId)return {error:"Cobertura inválida."};
  try{
    const {supabase}=await requireActiveUser();
    const {data,error}=await supabase.rpc("set_event_coverage_article",{p_event_id:eventId,p_completed:complete});
    if(error||!data)return {error:error?.message??"Não foi possível atualizar a matéria."};
    refreshAgenda();return {ok:true};
  }catch(error){return {error:error instanceof Error?error.message:"Falha na matéria."};}
}

export async function saveCoverageAlertsAction(eventId:string,formData:FormData):Promise<AgendaActionResult>{
  if(!eventId)return {error:"Cobertura inválida."};
  const audibleClock=value(formData,"coverage_audible_time");
  const checkinClock=value(formData,"coverage_checkin_time");
  // Calcular no servidor com a hora atual do evento evita confiar no
  // browser e preserva os lembretes quando a data/hora for editada.
  const dueDate=value(formData,"article_due_at");
  if(dueDate && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueDate))return {error:"Prazo de matéria inválido."};
  const due=dueDate?new Date(dueDate+":00-03:00").toISOString():null;
  try{
    const {supabase}=await requireActiveUser();
    const eventClock=await coverageStartTime(supabase,eventId);
    const audible=coverageMinutesBefore(eventClock,audibleClock);
    const checkin=coverageMinutesBefore(eventClock,checkinClock);
    if(audible===null||checkin===null||checkin< -120||checkin>120)
      return {error:"Horários inválidos. A confirmação deve ficar a até 2 horas do evento."};
    const {data,error}=await supabase.rpc("set_event_coverage_alerts",{
      p_event_id:eventId,p_audible_minutes:audible,p_checkin_minutes:checkin,p_article_due_at:due,
    });
    if(error||!data)return {error:error?.message??"Não foi possível salvar lembretes."};
    refreshAgenda();return {ok:true};
  }catch(error){return {error:error instanceof Error?error.message:"Falha nos lembretes."};}
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


/** Gestão manual de convidados: preserva respostas dos nomes mantidos. */
export async function setAgendaMeetingInviteesAction(
 eventId:string,profileIds:string[],
):Promise<AgendaActionResult>{
 if(!eventId||profileIds.length>50)return {error:"Convites inválidos."};
 try{
   const {supabase}=await requireActiveUser();
   const {error}=await supabase.rpc("set_agenda_event_invitees",{
     p_event_id:eventId,p_profile_ids:[...new Set(profileIds)],
   });
   if(error)return {error:error.message};
   refreshAgenda();
   return {ok:true};
 }catch(error){
   return {error:error instanceof Error?error.message:"Não foi possível atualizar convidados."};
 }
}

/** Só o próprio convidado confirma; não conclui tarefa do responsável. */
export async function respondAgendaInvitationAction(
 eventId:string,response:"accepted"|"declined",
):Promise<AgendaActionResult>{
 if(!eventId||!["accepted","declined"].includes(response))return {error:"Resposta inválida."};
 try{
   const {supabase}=await requireActiveUser();
   const {data,error}=await supabase.rpc("respond_agenda_event_invitation",{
     p_event_id:eventId,p_response:response,
   });
   if(error||data!==true)return {error:error?.message??"Convite não encontrado ou indisponível."};
   refreshAgenda();
   return {ok:true};
 }catch(error){
   return {error:error instanceof Error?error.message:"Não foi possível responder ao convite."};
 }
}
