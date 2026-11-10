"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  completeMyAgendaAssignmentAction,
  completeMyPautaItemAction,
  createAgendaEventAction,
  createEditorialWorkflowAction,
  activateEditorialWorkflowAction,
  createPautaFromAgendaEventAction,
  createPautaItemAction,
  enableCoverageAction,
  requestCoverageTransferAction,
  respondCoverageTransferAction,
  markCoverageAttendanceAction,
  finishCoverageArticleAction,
  saveCoverageAlertsAction,
  finishCoverageFieldTaskAction,
  saveCoverageTaskLabelAction,
  saveAgendaAssigneeTaskAction,
  answerCoverageAttendanceAction,
  completeCoverageTaskAction,
  assignCoverageTasksAction,
  requestCoverageTeamTransferAction,
  respondCoverageTeamTransferAction,
  savePautaPeriodAction,
  setAgendaEventStatusAction,
  setPautaItemStatusAction,
  updateAgendaEventAction,
  updatePautaItemAction,
  setAgendaMeetingInviteesAction,
  respondAgendaInvitationAction,
} from "./actions";
import type { AgendaEventItem, AgendaWorkspaceData, EventCoverage, WeeklyPautaItem } from "./agendaTypes";
import { coverageClockAt, validCoverageClock } from "./coverageClock";
import { FIXED_COVERAGE_TASKS,type CoverageTaskDraft } from "./coverageTaskCatalog";
import { EditorialWorkflowCreate } from "./EditorialWorkflowCreate";
import { EditorialWorkflowPanel } from "./EditorialWorkflowPanel";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { notify } from "../../lib/feedback/notify";
import { confirmDialog } from "../../lib/feedback/confirmStore";

/** Só interrompe atualização quando há conteúdo realmente modificado.
 * Deixar um formulário aberto, sem alteração, não é motivo para avisos.
 */
function hasDirtyAgendaForm(): boolean {
  const forms = document.querySelectorAll<HTMLFormElement>(
    ".agenda-inline-edit[open] form,.agenda-create-panel[open] form,.pauta-create-panel[open] form,.pauta-period-form",
  );
  return Array.from(forms).some((form) => Array.from(form.elements).some((field) => {
    if (field instanceof HTMLInputElement) {
      if (field.type === "hidden" || field.type === "submit" || field.type === "button") return false;
      if (field.type === "checkbox" || field.type === "radio") return field.checked !== field.defaultChecked;
      return field.value !== field.defaultValue;
    }
    if (field instanceof HTMLTextAreaElement) return field.value !== field.defaultValue;
    if (field instanceof HTMLSelectElement) {
      const original = Array.from(field.options).filter((opt) => opt.defaultSelected).map((opt) => opt.value);
      return field.multiple
        ? Array.from(field.selectedOptions).map((opt) => opt.value).join("|") !== original.join("|")
        : Boolean(original.length && field.value !== original[0]);
    }
    return false;
  }));
}

// Alterar aqui se a equipe precisar de sincronizacao mais rapida/lenta.
const AGENDA_MIN_SYNC_INTERVAL_MS = 60_000;

interface AgendaWorkspaceProps {
  data: AgendaWorkspaceData;
  initialView: "agenda" | "pauta";
  basePath: "/sistema/agenda" | "/agenda";
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function ymd(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return ymd(date);
}

function shortDate(value: string): string {
  return parseDate(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function longDate(value: string): string {
  return parseDate(value).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function monthLabel(value: string): string {
  const text = parseDate(value).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Cor deterministica derivada do UUID: mesmo responsavel, mesma cor
 * no computador e no aplicativo, sem depender da ordem de cadastro.
 */
function personColor(id: string): string {
  if (!id) return "hsl(215 18% 48%)";
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return `hsl(${(hash >>> 0) % 360} 62% 38%)`;
}

function nowInAgendaTimezone(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + "-" + values.month + "-" + values.day
    + "T" + values.hour + ":" + values.minute;
}

function editorialDueInLocalTime(iso:string|null):string|null{
 if(!iso)return null;
 const parts=new Intl.DateTimeFormat("sv-SE",{
  timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23",
 }).formatToParts(new Date(iso));
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return m.year+"-"+m.month+"-"+m.day+"T"+m.hour+":"+m.minute;
}

/** Horário do evento NUNCA é o prazo da matéria. */
function eventOverdue(event:AgendaEventItem,now:string):boolean{
 if(event.status!=="scheduled")return false;
 const due=event.workflowKind!=="general"
   ?event.articleDueAt:event.coverage?.articleDueAt??null;
 const local=editorialDueInLocalTime(due);
 return Boolean(local&&local<now);
}
function pautaOverdue(item:WeeklyPautaItem,now:string):boolean{
 if(item.status!=="pending")return false;
 if(item.workflow||item.coverage){
  const due=editorialDueInLocalTime(item.workflow?.articleDueAt??item.coverage?.articleDueAt??null);
  return Boolean(due&&due<now);
 }
 // Prazo do compromisso original não equivale a prazo editorial.
 if(item.agendaEventId)return false;
 return Boolean(item.dueDate&&(item.dueDate+"T"+(item.dueTime||"23:59")<now));
}

function statusLabel(status: string, overdue = false): string {
  if (status === "completed") return "Concluído";
  if (status === "cancelled") return "Cancelado";
  return overdue ? "Atrasado" : "Agendado";
}

function initials(name: string): string {
  const names = name.trim().split(/\s+/).filter(Boolean);
  return names.length > 1
    ? (names[0][0] + names[names.length - 1][0]).toLocaleUpperCase("pt-BR")
    : names[0]?.slice(0, 2).toLocaleUpperCase("pt-BR") ?? "?";
}

/** Seleção de equipe estilo lista de pessoas, com anel e visto no avatar.
 * Inputs nativos ficam visualmente ocultos, mas continuam acessíveis
 * e são enviados pelo FormData, sem alterar banco ou permissões.
 */
function AssigneePicker({
  profiles,
  selectedIds,
  currentUserId,
}: {
  profiles: AgendaWorkspaceData["profiles"];
  selectedIds?: string[];
  currentUserId?: string;
}): JSX.Element {
  const selected = new Set(selectedIds ?? (currentUserId ? [currentUserId] : []));
  return (
    <fieldset className="agenda-assignees agenda-assignee-picker">
      <legend>Responsáveis</legend>
      <div className="agenda-assignee-options">
        {profiles.length === 0 ? <span className="helper-text">Nenhum usuário ativo.</span> : profiles.map((profile) => (
          <label key={profile.id} className="agenda-person-option">
            <input type="checkbox" name="assignee_profile_ids" value={profile.id} defaultChecked={selected.has(profile.id)} />
            <span className="agenda-person-avatar"
              style={{ "--person-color": personColor(profile.id) } as CSSProperties} aria-hidden="true">
              {initials(profile.name)}<i>✓</i>
            </span>
            <span className="agenda-person-name">{profile.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Um unico seletor nativo de dia e horario no mobile.
 * Mantem as duas chaves historicas aceitas pelas actions do Supabase.
 * Registros antigos sem hora continuam sem hora ate serem editados.
 */
function PautaDateTimeField({
  initialDate,
  initialTime,
  weekStart,
  weekEnd,
  required = false,
}: {
  initialDate: string;
  initialTime: string | null;
  weekStart: string;
  weekEnd: string;
  required?: boolean;
}): JSX.Element {
  return (
    <div className="agenda-field pauta-datetime-field">
      <label htmlFor={required ? "new-pauta-date-time" : undefined}>
        Data e horário{required ? "" : " (opcional alterar)"}
      </label>
      <input name="due_date" type="hidden" defaultValue={initialDate} />
      <input name="due_time" type="hidden" defaultValue={initialTime ?? ""} />
      <input
        id={required ? "new-pauta-date-time" : undefined}
        type="datetime-local"
        aria-label="Selecionar data e horário da pauta"
        min={weekStart + "T00:00"}
        max={weekEnd + "T23:59"}
        defaultValue={initialTime ? initialDate + "T" + initialTime.slice(0, 5) : ""}
        required={required}
        onChange={(event) => {
          const value = event.currentTarget.value;
          const form = event.currentTarget.form;
          const date = form?.elements.namedItem("due_date") as HTMLInputElement | null;
          const time = form?.elements.namedItem("due_time") as HTMLInputElement | null;
          if (date) date.value = value.length >= 10 ? value.slice(0, 10) : initialDate;
          if (time) time.value = value.length >= 16 ? value.slice(11, 16) : "";
        }}
      />
      {!required && !initialTime ? <small>Esta pauta ainda não possui horário definido.</small> : null}
    </div>
  );
}

// Apenas para o cadastro de compromissos: preserva os seletores nativos
// de data/hora, com um botao independente para limpar o valor.
function ClearableScheduleInput({
  name, label, type, defaultValue, required = false,
}: {
  name: "event_date" | "start_time" | "end_time";
  label: string;
  type: "date" | "time";
  defaultValue?: string;
  required?: boolean;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = "agenda-new-" + name;
  return (
    <div className={"agenda-field agenda-schedule-" + (name === "event_date" ? "date" : name === "start_time" ? "start" : "end")}>
      <label htmlFor={inputId}>{label}</label>
      <div className="agenda-clear-input">
        <input ref={inputRef} id={inputId} name={name} type={type} defaultValue={defaultValue} required={required} />
        <button
          type="button"
          className="agenda-clear-input-button"
          aria-label={"Limpar " + label.toLowerCase()}
          title={"Limpar " + label.toLowerCase()}
          onClick={() => {
            if (!inputRef.current) return;
            inputRef.current.value = "";
            inputRef.current.focus();
          }}
        >×</button>
      </div>
    </div>
  );
}

function CoverageClockFields({eventTime,audible=60,checkin=5}:{
 eventTime:string;audible?:number;checkin?:number;
}):JSX.Element {
 return <>
  <label className="agenda-field coverage-clock-field">
   <span>Horário do aviso principal</span>
   <input key={"alarm-"+eventTime} name="coverage_audible_time" type="time"
     required disabled={!eventTime} defaultValue={coverageClockAt(eventTime,audible)}/>
   <small>Com som, conforme as permissões do aparelho.</small>
  </label>
  <label className="agenda-field coverage-clock-field">
   <span>Horário de confirmar chegada</span>
   <input key={"arrival-"+eventTime} name="coverage_checkin_time" type="time"
     required disabled={!eventTime} defaultValue={coverageClockAt(eventTime,checkin)}/>
   <small>Notificação silenciosa, editável minuto a minuto.</small>
  </label>
 </>;
}

/** Indicador compacto na linha REDAÇÃO / ORGANIZAÇÃO. */
export function AgendaOverdueIndicator({data}:{data:AgendaWorkspaceData}):JSX.Element|null{
 const [clock,setClock]=useState("");
 useEffect(()=>{
   const update=()=>setClock(nowInAgendaTimezone());
   update();const interval=window.setInterval(update,30000);
   return ()=>window.clearInterval(interval);
 },[]);
 if(!clock)return null;
 const events=data.events.filter(item=>item.showInAgenda&&eventOverdue(item,clock));
 const linked=new Set(data.events.filter(item=>item.showInAgenda).map(item=>item.id));
 const pauta=data.pautaItems.filter(item=>
   pautaOverdue(item,clock)&&(!item.agendaEventId||!linked.has(item.agendaEventId)));
 const count=events.length+pauta.length;
 if(!count)return null;
 const href=events.length
   ? "/sistema/agenda?date="+events[0].eventDate
   : "/sistema/pauta?date="+(pauta[0]?.dueDate||data.today);
 return <details className="agenda-overdue-floating">
  <summary aria-label={count+" pendências. Mostrar detalhes."}>
   <span aria-hidden="true">⚠</span> {count} {count===1?"atraso":"atrasos"}
  </summary>
  <div className="agenda-overdue-popover">
   <strong>{count} {count===1?"pendência":"pendências"} em aberto</strong>
   <p>Compromissos e pautas com horário ultrapassado.</p>
   <Link href={href}>Ver atrasados</Link>
  </div>
 </details>;
}

function CoverageTaskPicker({tasks,onChange}:{
 tasks:CoverageTaskDraft[];onChange:(tasks:CoverageTaskDraft[])=>void;
}):JSX.Element{
 const [custom,setCustom]=useState("");
 const [customOpen,setCustomOpen]=useState(false);
 const [message,setMessage]=useState("");
 const has=(kind:string)=>tasks.some(t=>t.kind===kind);
 const toggle=(task:(typeof FIXED_COVERAGE_TASKS)[number])=>{
   onChange(has(task.kind)?tasks.filter(t=>t.kind!==task.kind):[...tasks,task]);
 };
 const addCustom=()=>{
   const label=custom.trim().replace(/\s+/g," ");
   if(label.length<2||label.length>80){setMessage("Informe entre 2 e 80 caracteres.");return;}
   if(tasks.length>=8){setMessage("Máximo de oito tarefas.");return;}
   if(tasks.some(t=>t.label.toLocaleLowerCase("pt-BR")===label.toLocaleLowerCase("pt-BR"))){
    setMessage("Tarefa já selecionada.");return;
   }
   onChange([...tasks,{kind:"custom",label}]);
   setCustom("");setCustomOpen(false);setMessage("");
 };
 return <div className="coverage-task-selector">
   <span className="coverage-task-selector-label">O que fará? <small>(toque para selecionar)</small></span>
   <div className="coverage-task-options" role="group" aria-label="Tarefas para o colaborador">
    {FIXED_COVERAGE_TASKS.map(task=><button key={task.kind} type="button"
      className={"coverage-task-option"+(has(task.kind)?" is-selected":"")}
      aria-pressed={has(task.kind)} disabled={!has(task.kind)&&tasks.length>=8}
      onClick={()=>toggle(task)}>{has(task.kind)?"✓ ":""}{task.label}</button>)}
    <button type="button" className="coverage-task-option coverage-task-other"
      aria-expanded={customOpen} onClick={()=>setCustomOpen(value=>!value)}>＋ Outra tarefa</button>
   </div>
   {customOpen?<div className="coverage-custom-task">
      <input type="text" value={custom} maxLength={80} placeholder="Descreva a tarefa"
        aria-label="Tarefa personalizada" onChange={e=>{setCustom(e.currentTarget.value);setMessage("");}}/>
      <button type="button" onClick={addCustom}>Adicionar</button>
    </div>:null}
   {tasks.filter(t=>t.kind==="custom").length>0?<div className="coverage-custom-tasks">
    {tasks.filter(t=>t.kind==="custom").map((task,i)=><button type="button"
      key={task.label+i} title="Remover tarefa personalizada"
      onClick={()=>onChange(tasks.filter(t=>t!==task))}>{task.label} ×</button>)}
   </div>:null}
   {message?<small role="alert" className="coverage-task-error">{message}</small>:null}
   {tasks.length===0?<small className="coverage-task-error">Escolha ao menos uma função.</small>:null}
 </div>;
}

function CoverageTeamAddFields({profiles,currentUserId,existing}:{
 profiles:AgendaWorkspaceData["profiles"];currentUserId:string;existing:string[];
}):JSX.Element{
 const first=profiles.find(p=>!existing.includes(p.id))?.id??currentUserId;
 const [tasks,setTasks]=useState<CoverageTaskDraft[]>([]);
 return <>
  <label className="agenda-field"><span>Colaborador</span>
   <select name="team_new_person" required defaultValue={first}>
    {profiles.map(person=><option key={person.id} value={person.id}>
      {person.name}{existing.includes(person.id)?" — adicionar tarefa":""}
    </option>)}
   </select>
  </label>
  <CoverageTaskPicker tasks={tasks} onChange={setTasks}/>
  <input type="hidden" name="team_new_tasks_json" value={JSON.stringify(tasks)}/>
 </>;
}

function CoveragePeopleFields({profiles,currentUserId,eventTime}:{
  profiles:AgendaWorkspaceData["profiles"];currentUserId:string;eventTime:string;
}):JSX.Element{
 const [crew,setCrew]=useState<Array<{
  key:number;profileId:string;tasks:CoverageTaskDraft[];
 }>>([{key:1,profileId:currentUserId,tasks:[]}]);
 const [counter,setCounter]=useState(2);
 const unused=profiles.find(profile=>!crew.some(member=>member.profileId===profile.id));
 const changeProfile=(key:number,value:string)=>{
  setCrew(rows=>rows.map(row=>row.key===key?{...row,profileId:value}:row));
 };
 const changeTasks=(key:number,value:CoverageTaskDraft[])=>{
  setCrew(rows=>rows.map(row=>row.key===key?{...row,tasks:value}:row));
 };
 return <div className="coverage-team-editor">
  <div className="coverage-team-heading">
   <strong>Quem vai ao evento?</strong>
   <small>Um colaborador por vez, com quantas entregas forem necessárias.</small>
  </div>
  {crew.map((member,index)=><div className="coverage-team-row" key={member.key}>
   <label className="agenda-field">
    <span>Colaborador {index+1}</span>
    <select value={member.profileId} required onChange={event=>changeProfile(member.key,event.currentTarget.value)}>
     {profiles.filter(profile=>profile.id===member.profileId||
       !crew.some(row=>row.key!==member.key&&row.profileId===profile.id))
       .map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
    </select>
   </label>
   <CoverageTaskPicker tasks={member.tasks}
    onChange={tasks=>changeTasks(member.key,tasks)}/>
   {crew.length>1?<button type="button" className="coverage-remove"
    aria-label={"Retirar colaborador "+(index+1)}
    onClick={()=>setCrew(rows=>rows.filter(row=>row.key!==member.key))}>×</button>:null}
  </div>)}
  <input type="hidden" name="coverage_team_json"
   value={JSON.stringify(crew.map(member=>({
    profileId:member.profileId,tasks:member.tasks,
   })))}/>
  <button type="button" className="coverage-add"
   disabled={!unused||crew.length>=16}
   onClick={()=>{
    if(!unused)return;
    setCrew(rows=>[...rows,{
      key:counter,profileId:unused.id,tasks:[],
    }]);
    setCounter(n=>n+1);
   }}>＋ Adicionar colaborador</button>
  <div className="coverage-team-bottom">
   <label className="agenda-field coverage-article-person">
    <span>Quem redigirá a matéria? (um responsável)</span>
    <select name="coverage_article_owner" required defaultValue="">
     <option value="" disabled>Selecionar redator</option>
     {profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}
    </select>
   </label>
   <CoverageClockFields eventTime={eventTime}/>
  </div>
 </div>;
}

function CoverageOptIn({data}:{data:AgendaWorkspaceData}):JSX.Element {
 const [enabled,setEnabled]=useState(false);
 const [eventTime,setEventTime]=useState("");
 const fieldsetRef=useRef<HTMLFieldSetElement>(null);
 useEffect(()=>{
   const form=fieldsetRef.current?.closest("form");
   if(!form)return;
   const syncClock=()=>{
     const start=form.querySelector<HTMLInputElement>('input[name="start_time"]');
     const datetime=form.querySelector<HTMLInputElement>('input[type="datetime-local"]');
     const fromDateTime=datetime?.value?.slice(11,16)||"";
     const clock=start?.value||fromDateTime||"";
     setEventTime(validCoverageClock(clock)?clock:"");
   };
   syncClock();
   form.addEventListener("input",syncClock);
   form.addEventListener("change",syncClock);
   return ()=>{
     form.removeEventListener("input",syncClock);
     form.removeEventListener("change",syncClock);
   };
 },[]);
 return <fieldset ref={fieldsetRef} className="coverage-opt-in agenda-field-wide">
  <button type="button" className={"coverage-switch-button"+(enabled?" is-active":"")}
    aria-pressed={enabled} onClick={()=>setEnabled(v=>!v)}>
    <strong>{enabled?"✓ Evento + matéria":"＋ Evento + matéria"}</strong>
    <small>{enabled?"Presença e matéria com responsáveis":"Adicionar presença e matéria à cobertura"}</small>
  </button>
  {enabled?<input type="hidden" name="coverage_enabled" value="true"/>:null}
  {enabled?<CoveragePeopleFields profiles={data.profiles}
    currentUserId={data.currentUserId} eventTime={eventTime}/>:null}
 </fieldset>;
}

export function AgendaWorkspace({ data, initialView, basePath }: AgendaWorkspaceProps): JSX.Element {
  const router = useRouter();
  const realtimeClient = useMemo(() => createSupabaseBrowserClient(), []);
  const lastSyncAtRef = useRef(Date.now());
  const [selectedDate, setSelectedDate] = useState(data.focusDate);
  const [localClock, setLocalClock] = useState(() => nowInAgendaTimezone());
  const [realtimeState, setRealtimeState] = useState<"connecting" | "online" | "offline">("connecting");
  const [remoteChanges, setRemoteChanges] = useState(false);
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);
  const [isPeriodEditorOpen, setIsPeriodEditorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setSelectedDate(data.focusDate), [data.focusDate]);
  useEffect(() => setIsPeriodEditorOpen(false), [data.weekStart]);
  // Muda de "Agendado" para "Atrasado" sem exigir F5, inclusive à meia-noite.
  useEffect(() => {
    const refreshClock = () => setLocalClock(nowInAgendaTimezone());
    const timer = window.setInterval(refreshClock, 30_000);
    window.addEventListener("focus", refreshClock);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshClock); };
  }, []);

  // Recebe avisos em tempo real, mas agrupa as consultas da Agenda em ate 1 por minuto.
  // Sem alteracoes, nao ha polling; a RLS do Supabase continua protegendo os dados.
  useEffect(() => {
    let pendingRefresh: ReturnType<typeof setTimeout> | undefined;
    let subscribedOnce = false;
    let postponedWhileOpen = false;
    const isEditing = () => hasDirtyAgendaForm();
    const hasExpandedPanel = () => Boolean(document.querySelector(".agenda-workspace details[open]"));

    const refresh = () => {
      pendingRefresh = undefined;
      if (document.visibilityState !== "visible") return;
      if (isEditing()) {
        // Preservar os dados que o usuario ainda nao salvou.
        setRemoteChanges(true);
        return;
      }
      if (hasExpandedPanel()) {
        // Não fechar uma aba aberta só porque outro usuário sincronizou.
        postponedWhileOpen = true;
        return;
      }
      // Uma acao local pode ter recarregado a pagina depois que o timer foi agendado.
      const remaining = AGENDA_MIN_SYNC_INTERVAL_MS - (Date.now() - lastSyncAtRef.current);
      if (remaining > 0) {
        pendingRefresh = setTimeout(refresh, remaining);
        return;
      }
      lastSyncAtRef.current = Date.now();
      router.refresh();
    };
    const scheduleRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (isEditing()) {
        setRemoteChanges(true);
        return;
      }
      if (hasExpandedPanel()) {
        postponedWhileOpen = true;
        return;
      }
      if (pendingRefresh !== undefined) return;
      const delay = Math.max(0, AGENDA_MIN_SYNC_INTERVAL_MS - (Date.now() - lastSyncAtRef.current));
      pendingRefresh = setTimeout(refresh, delay);
    };
    const channel = realtimeClient.channel("agenda-equipe-" + data.currentUserId)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_events" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_event_assignees" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_pauta_items" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "pauta_week_overrides" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_coverages" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_coverage_members" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_coverage_member_transfers" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_coverage_transfers" }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeState("online");
          // Reconciliar alteracoes perdidas durante uma desconexao, sem polling continuo.
          if (subscribedOnce) scheduleRefresh();
          subscribedOnce = true;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("offline");
      });
    // Ao voltar a aba, verificar novamente com o mesmo limite de 1 minuto.
    const onFocus = () => scheduleRefresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
      else if (pendingRefresh !== undefined) {
        clearTimeout(pendingRefresh);
        pendingRefresh = undefined;
      }
    };
    // Reconciliar quando a equipe terminar de usar os painéis.
    // Não exibe banner se o formulário aberto nunca foi modificado.
    const onPanelToggle = () => {
      if (!postponedWhileOpen || hasExpandedPanel()) return;
      postponedWhileOpen = false;
      scheduleRefresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("toggle", onPanelToggle, true);
    return () => {
      if (pendingRefresh !== undefined) clearTimeout(pendingRefresh);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("toggle", onPanelToggle, true);
      void realtimeClient.removeChannel(channel);
    };
  }, [data.currentUserId, realtimeClient, router]);

  const days = useMemo(() => {
    const month = parseDate(data.focusDate);
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const weekday = first.getDay();
    const offset = weekday === 0 ? 6 : weekday - 1;
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - offset, 12);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { value: ymd(date), day: date.getDate(), currentMonth: date.getMonth() === month.getMonth() };
    });
  }, [data.focusDate]);

  const filteredEvents = useMemo(
    () => data.events.filter((event) =>
      event.showInAgenda && (!responsibleFilter || event.assignees.some((profile) => profile.id === responsibleFilter))),
    [data.events, responsibleFilter],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof data.events>();
    for (const event of filteredEvents) {
      const list = map.get(event.eventDate) ?? [];
      list.push(event);
      map.set(event.eventDate, list);
    }
    return map;
  }, [filteredEvents]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  // Navegacao semanal no celular: o mes completo continua disponivel sob demanda.
  const selectedWeekday = (parseDate(selectedDate).getDay() + 6) % 7;
  const selectedWeekStart = addDays(selectedDate, -selectedWeekday);
  const selectedWeekDays = Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index));
  const todayCount = filteredEvents.filter((event) => event.eventDate === localClock.slice(0, 10) && event.status !== "cancelled").length;
  const ownPending = data.events.filter(event=>
    event.status==="scheduled" && (event.workflowKind!=="general"
      ?event.articleOwnerId===data.currentUserId
      :event.assignees.some(person=>person.id===data.currentUserId&&!person.completedAt))).length +
    data.pautaItems.filter((item) =>
      item.status === "pending" && item.responsibleProfileId === data.currentUserId && !item.agendaEventId).length;
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(data.weekStart, index));
  const initialPautaDate = data.today >= data.periodStart && data.today <= data.periodEnd ? data.today : data.periodStart;
  const monthEventCount = data.events.filter((event) => event.eventDate >= data.monthStart && event.eventDate <= data.monthEnd).length;
  const pautaItems = responsibleFilter
    ? data.pautaItems.filter((item) => item.responsibleProfileId === responsibleFilter || item.assignees.some((person) => person.id === responsibleFilter))
    : data.pautaItems;

  function navigate(view: "agenda" | "pauta", date: string): void {
    const path = basePath === "/sistema/agenda"
      ? (view === "pauta" ? "/sistema/pauta" : "/sistema/agenda")
      : basePath + "?view=" + view;
    router.push(path + (path.includes("?") ? "&date=" : "?date=") + date);
  }

  function moveMonth(delta: number): void {
    const date = parseDate(data.focusDate);
    date.setDate(1);
    date.setMonth(date.getMonth() + delta);
    navigate("agenda", ymd(date));
  }

  function openCreate(): void {
    const id = initialView === "agenda" ? "agenda-create-panel" : "pauta-create-panel";
    const node = document.getElementById(id);
    if (!node) return;
    if (node instanceof HTMLDetailsElement) node.open = true;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = node.querySelector<HTMLInputElement>('input[name="title"]');
    if (input) window.setTimeout(() => input.focus({ preventScroll: true }), 280);
  }

  function moveWeek(delta: number): void {
    navigate("pauta", addDays(data.weekStart, delta * 7));
  }

  function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    success: string,
    reset?: () => void,
  ): void {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        notify.error("Não foi possível concluir a ação na Agenda", result.error);
        return;
      }
      reset?.();
      notify.success("Agenda atualizada", success);
      setRemoteChanges(false);
      lastSyncAtRef.current = Date.now();
      router.refresh();
    });
  }

  function EnableCoverage({item}:{item:AgendaEventItem}):JSX.Element {
    return <details className="agenda-inline-edit coverage-activate">
      <summary>＋ Definir tipo e responsáveis</summary>
      <p className="workflow-help">Aproveita o compromisso e a Pauta existentes, sem criar cópias.</p>
      <EditorialWorkflowCreate key={item.id}
        profiles={data.profiles} currentUserId={data.currentUserId}
        weekStart={data.weekStart} selectedDate={item.eventDate} view="agenda"
        existing={item}
        initialWriterId={data.pautaItems.find(p=>p.agendaEventId===item.id)?.responsibleProfileId??undefined}
        isPending={isPending} onCreate={form=>
          run(()=>activateEditorialWorkflowAction(item.id,form),"Tipo e responsabilidades atualizados.")}/>
    </details>;
  }

  function TeamCoveragePanel({coverage,eventId,eventTime}:{
    coverage:EventCoverage;eventId:string;eventTime:string;
  }):JSX.Element{
    const manager=data.access.coverageManage;
    const label=(id:string)=>data.profiles.find(p=>p.id===id)?.name??"Colaborador";
    const me=coverage.members.find(person=>person.profileId===data.currentUserId);
    const writer=coverage.articleOwnerId===data.currentUserId;
    const names=Array.from(new Set([...coverage.members.map(m=>m.profileId),coverage.articleOwnerId]));
    const resLabel={
      pending:"Aguardando resposta",present:"Compareceu",
      not_required:"Não precisa estar presente",unable:"Não poderá ir",
    };
    const allFieldDone=coverage.members.every(m=>m.tasks.every(t=>Boolean(t.completedAt)));
    return <section className="coverage-panel coverage-team-panel" aria-label="Equipe de cobertura">
      <header className="coverage-panel-title">
        <strong>COBERTURA DO EVENTO</strong>
        <small>Agenda: presença · Pauta: fotos, vídeo e matéria</small>
      </header>
      <div className="coverage-team-members">
        {coverage.members.map(member=>{
          const isMe=member.profileId===data.currentUserId;
          return <div key={member.profileId} className="coverage-member-card">
            <div className="coverage-member-heading">
              <strong>{label(member.profileId)}</strong>
              <span>{member.tasks.map(t=>t.label).join(" · ")||
                (member.profileId===coverage.articleOwnerId?"Redação da matéria":"Participação")}</span>
            </div>
            <div className="coverage-participation">
              <small>Participação na Agenda · {resLabel[member.attendanceResponse]}</small>
              {isMe&&member.tasks.length>0?<div className="coverage-attendance-buttons" role="group" aria-label="Confirmar participação no evento">
                {([
                  ["present","Compareci"],
                  ["not_required","Não preciso ir"],
                  ["unable","Não poderei ir"],
                ] as const).map(([value,text])=><button key={value} type="button"
                  className={member.attendanceResponse===value?"is-selected":""}
                  aria-pressed={member.attendanceResponse===value}
                  disabled={isPending}
                  onClick={()=>run(()=>answerCoverageAttendanceAction(eventId,value),"Participação registrada.")}>
                    {text}
                </button>)}
              </div>:null}
            </div>
            {member.tasks.map(task=><div key={task.id} className="coverage-field-delivery">
              <small><strong>{task.completedAt?"✓ Concluída":"Pendente"}</strong> · {task.label}
                {task.completedAt&&task.completedBy&&task.completedBy!==member.profileId
                  ?" · Baixa por "+label(task.completedBy):""}</small>
              {(isMe||manager)?<button type="button" disabled={isPending} onClick={()=>run(
                ()=>completeCoverageTaskAction(eventId,task.id,!task.completedAt),
                task.completedAt?"Entrega reaberta.":"Entrega concluída."
              )}>{task.completedAt?"Reabrir":"✓ Dar baixa"}</button>:null}
            </div>)}
          </div>;
        })}
      </div>
      <div className="coverage-team-article">
        <div><strong>MATÉRIA JORNALÍSTICA</strong><small>{label(coverage.articleOwnerId)} ·
          {coverage.articleStatus==="completed"?" Concluída":" Pendente"}</small></div>
        {(writer||manager)?<button type="button" disabled={isPending} onClick={()=>run(
          ()=>finishCoverageArticleAction(eventId,coverage.articleStatus!=="completed"),
          coverage.articleStatus==="completed"?"Matéria reaberta.":"Matéria concluída."
        )}>{coverage.articleStatus==="completed"?"Reabrir matéria":"✓ Concluir matéria"}</button>:null}
      </div>
      <p className="coverage-help">
        {allFieldDone&&coverage.articleStatus==="completed"
          ?"Todas as entregas da Pauta estão concluídas."
          :"A matéria continuará na Pauta até a redação e as entregas de campo ficarem prontas."}
      </p>
      {coverage.pendingTeamTransfers.length>0?<div className="coverage-transfer-notice">
        <strong>Transferências aguardando confirmação</strong>
        {coverage.pendingTeamTransfers.map(t=><div className="coverage-transfer-line" key={t.id}>
          <span>{label(t.fromProfileId)} → {label(t.toProfileId)} ·
            {t.part==="field"?" Campo":t.part==="article"?" Matéria":" Ambas"}</span>
          <small>{t.reason}</small>
          {t.toProfileId===data.currentUserId?<div className="coverage-step-actions">
            <button type="button" disabled={isPending} onClick={()=>run(
              ()=>respondCoverageTeamTransferAction(t.id,true),"Transferência aceita."
            )}>Aceitar</button>
            <button type="button" disabled={isPending} onClick={()=>run(
              ()=>respondCoverageTeamTransferAction(t.id,false),"Transferência recusada."
            )}>Recusar</button>
          </div>:null}
        </div>)}
      </div>:null}
      {manager?<details className="coverage-options">
        <summary>＋ Adicionar pessoa ou novas tarefas</summary>
        <form className="coverage-form" onSubmit={event=>{
          event.preventDefault();run(()=>assignCoverageTasksAction(eventId,new FormData(event.currentTarget)),
            "Tarefas atribuídas e colaborador notificado.");
        }}>
          <CoverageTeamAddFields profiles={data.profiles}
            currentUserId={data.currentUserId}
            existing={coverage.members.map(m=>m.profileId)}/>
          <button type="submit" className="agenda-primary" disabled={isPending}>Salvar novas tarefas</button>
        </form>
      </details>:null}
      {(me||writer||manager)?<details className="coverage-options">
        <summary>↔ Transferir responsabilidade</summary>
        <form className="coverage-form" onSubmit={event=>{
          event.preventDefault();run(()=>requestCoverageTeamTransferAction(eventId,new FormData(event.currentTarget)),
            "Transferência registrada. A responsabilidade muda após aceite.");
        }}>
          <label className="agenda-field"><span>Responsável atual</span>
            <select name="transfer_from" defaultValue={data.currentUserId} required
              disabled={!manager}>
              {names.map(id=><option key={id} value={id}>{label(id)}</option>)}
            </select>
            {!manager?<input type="hidden" name="transfer_from" value={data.currentUserId}/>:null}
          </label>
          <label className="agenda-field"><span>Transferir</span>
            <select name="transfer_part" defaultValue={writer&&!me?.tasks.length?"article":"field"}>
              <option value="field">Fotos/vídeo (campo)</option>
              <option value="article">Matéria</option>
              <option value="both">Ambas</option>
            </select>
          </label>
          <label className="agenda-field"><span>Para quem?</span>
            <select name="transfer_to" required defaultValue="">
              <option value="" disabled>Selecionar colaborador</option>
              {data.profiles.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="agenda-field"><span>Motivo</span>
            <input name="transfer_reason" required minLength={5} maxLength={300}
              placeholder="Ex.: substituição no evento"/>
          </label>
          {manager?<label className="coverage-force-check"><input type="checkbox"
            name="transfer_force" value="true"/> Efetivar imediatamente (gestor)</label>:null}
          <button type="submit" className="agenda-primary" disabled={isPending}>Solicitar transferência</button>
        </form>
      </details>:null}
      {manager||Boolean(me?.tasks.length)?<details className="coverage-options">
        <summary>⚙ Horários do evento</summary>
        <form className="coverage-form" onSubmit={event=>{
          event.preventDefault();run(()=>saveCoverageAlertsAction(eventId,new FormData(event.currentTarget)),
            "Horários atualizados.");
        }}>
          <CoverageClockFields eventTime={eventTime} audible={coverage.audibleMinutes}
            checkin={coverage.checkinMinutes}/>
          <button type="submit" className="agenda-primary" disabled={isPending}>Salvar horários</button>
        </form>
      </details>:null}
    </section>;
  }

  function CoveragePanel({coverage,eventId,eventTime}:{coverage:EventCoverage;eventId:string;eventTime:string}):JSX.Element{
    if(coverage.teamMode)return TeamCoveragePanel({coverage,eventId,eventTime});
    const profileName=(id:string)=>data.profiles.find(p=>p.id===id)?.name??"Colaborador";
    const myPresence=coverage.attendanceOwnerId===data.currentUserId;
    const myArticle=coverage.articleOwnerId===data.currentUserId;
    const manager=data.access.pautaWrite||data.access.agendaWrite;
    const canTransfer=myPresence||myArticle||manager;
    const request=coverage.pendingTransfer;
    const dueLocal=coverage.articleDueAt
      ? new Date(coverage.articleDueAt).toLocaleString("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).replace(" ","T"):"";
    return <section className="coverage-panel" aria-label="Cobertura jornalística">
      <header className="coverage-panel-title">
        <strong>🎙 Cobertura de evento</strong><small>Presença e matéria são etapas independentes</small>
      </header>
      <div className="coverage-steps">
        <div className="coverage-step">
          <div><strong>1. Comparecimento</strong><small>{profileName(coverage.attendanceOwnerId)}</small>
            <span className={"coverage-state is-"+coverage.attendanceStatus}>
              {coverage.attendanceStatus==="present"?"✓ Compareceu":
               coverage.attendanceStatus==="absent"?"Não compareceu":
               coverage.attendanceStatus==="on_way"?"Ainda não chegou":"Aguardando confirmação"}
            </span>
          </div>
          {myPresence&&coverage.attendanceStatus!=="present"?<div className="coverage-step-actions">
            <button type="button" onClick={()=>run(()=>markCoverageAttendanceAction(eventId,"present"),"Sua presença foi confirmada.")} disabled={isPending}>Compareci</button>
            <button type="button" onClick={()=>run(()=>markCoverageAttendanceAction(eventId,"on_way"),"Aguardando sua confirmação.")} disabled={isPending}>Ainda não</button>
            <button type="button" onClick={()=>run(()=>markCoverageAttendanceAction(eventId,"absent"),"Ausência registrada.")} disabled={isPending}>Não poderei ir</button>
          </div>:null}
        </div>
        <div className="coverage-step">
          <div>
            <strong>2. {coverage.taskLabel}</strong>
            <small>{profileName(coverage.attendanceOwnerId)}</small>
            <span className={"coverage-state is-"+coverage.taskStatus}>
              {coverage.taskStatus==="completed"?"✓ Tarefa concluída":"Aguardando entrega"}
            </span>
          </div>
          {(myPresence||manager)?<div className="coverage-step-actions">
            <button type="button" disabled={isPending} onClick={()=>run(
              ()=>finishCoverageFieldTaskAction(eventId,coverage.taskStatus!=="completed"),
              coverage.taskStatus==="completed"?"Tarefa reaberta.":"Trabalho de campo concluído."
            )}>{coverage.taskStatus==="completed"?"Reabrir tarefa":"Concluir "+coverage.taskLabel.toLocaleLowerCase("pt-BR")}</button>
          </div>:null}
        </div>
        <div className="coverage-step">
          <div><strong>3. Produção da matéria</strong><small>{profileName(coverage.articleOwnerId)}</small>
            <span className={"coverage-state is-"+coverage.articleStatus}>
              {coverage.articleStatus==="completed"?"✓ Matéria concluída":"Matéria pendente"}
            </span>
          </div>
          {(myArticle||manager)?<div className="coverage-step-actions">
            <button type="button" disabled={isPending} onClick={()=>run(
              ()=>finishCoverageArticleAction(eventId,coverage.articleStatus!=="completed"),
              coverage.articleStatus==="completed"?"Matéria reaberta.":"Matéria finalizada."
            )}>{coverage.articleStatus==="completed"?"Reabrir matéria":"Concluir matéria"}</button>
          </div>:null}
        </div>
      </div>
      {request?<div className="coverage-transfer-notice">
        <strong>Transferência aguardando aceite</strong>
        <span>{request.part==="attendance"?"Comparecimento":request.part==="article"?"Produção da matéria":"Ambas as etapas"} → {profileName(request.toProfileId)}</span>
        <small>Motivo: {request.reason}. Até o aceite, os titulares permanecem os mesmos.</small>
        {request.toProfileId===data.currentUserId?<div className="coverage-step-actions">
          <button type="button" className="agenda-primary" disabled={isPending}
            onClick={()=>run(()=>respondCoverageTransferAction(request.id,true),"Titularidade transferida.")}>Aceitar</button>
          <button type="button" disabled={isPending}
            onClick={()=>run(()=>respondCoverageTransferAction(request.id,false),"Transferência recusada.")}>Recusar</button>
        </div>:null}
      </div>:null}
      {canTransfer&&!request?<details className="coverage-options">
        <summary>↔ Transferir responsabilidade</summary>
        <form className="coverage-form" onSubmit={event=>{
          event.preventDefault();run(()=>requestCoverageTransferAction(eventId,new FormData(event.currentTarget)),
          "Transferência solicitada; titular permanece até aceite.");
        }}>
          <label className="agenda-field"><span>Transferir</span><select name="transfer_part" defaultValue="attendance">
            <option value="attendance">Somente comparecimento</option>
            <option value="article">Somente produção da matéria</option>
            <option value="both">As duas etapas</option>
          </select></label>
          <label className="agenda-field"><span>Novo responsável</span>
            <select name="transfer_to" required defaultValue="">
              <option value="" disabled>Selecionar colaborador</option>
              {data.profiles.filter(p=>p.id!==data.currentUserId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="agenda-field coverage-reason"><span>Motivo</span>
            <input name="transfer_reason" required minLength={5} maxLength={300}
              placeholder="Ex.: indisponibilidade na data"/></label>
          {manager?<label className="coverage-force-check">
            <input type="checkbox" name="transfer_force" value="true"/> Transferir imediatamente (somente gestor autorizado)
          </label>:null}
          <button type="submit" className="agenda-primary" disabled={isPending}>Solicitar transferência</button>
        </form>
      </details>:null}
      {(myPresence||manager)?<details className="coverage-options">
        <summary>✎ Personalizar tarefa de campo</summary>
        <form className="coverage-form" onSubmit={event=>{
          event.preventDefault();run(()=>saveCoverageTaskLabelAction(eventId,new FormData(event.currentTarget)),
           "Tarefa atualizada.");
        }}>
          <label className="agenda-field coverage-reason"><span>Qual é a tarefa do responsável?</span>
            <input type="text" list="agenda-task-suggestions" name="coverage_task_label"
              maxLength={80} minLength={2} required defaultValue={coverage.taskLabel}
              placeholder="Ex.: Tirar fotos, filmar, entrevistar"/>
          </label>
          <button type="submit" className="agenda-primary" disabled={isPending}>Salvar função</button>
        </form>
      </details>:null}
      {(myPresence||manager)?<details className="coverage-options">
        <summary>⚙ Horários e prazo</summary>
        <form className="coverage-form" onSubmit={event=>{
          event.preventDefault();run(()=>saveCoverageAlertsAction(eventId,new FormData(event.currentTarget)),
           "Lembretes atualizados para o responsável.");
        }}>
          <CoverageClockFields eventTime={eventTime} audible={coverage.audibleMinutes}
            checkin={coverage.checkinMinutes}/>
          <label className="agenda-field"><span>Prazo da matéria (opcional)</span>
            <input name="article_due_at" type="datetime-local" defaultValue={dueLocal}/></label>
          <small>Os horários acompanham o início do evento; você pode editar cada minuto.</small>
          <button type="submit" className="agenda-primary" disabled={isPending}>Salvar lembretes</button>
        </form>
      </details>:null}
    </section>;
  }

  function AssignmentRoles({item}:{item:AgendaEventItem}):JSX.Element {
    return <details className="agenda-inline-edit agenda-assignment-roles">
      <summary>✎ Definir quem faz fotos, matéria ou outra tarefa</summary>
      <div className="agenda-roles-list">
        {item.assignees.map(person=>(
          <form key={person.id} className="agenda-role-row" onSubmit={event=>{
            event.preventDefault();
            run(()=>saveAgendaAssigneeTaskAction(item.id,person.id,new FormData(event.currentTarget)),
              "Função de "+person.name+" atualizada.");
          }}>
            <span>{person.name}</span>
            <input name="assignee_task_label" type="text" list="agenda-task-suggestions"
              maxLength={80} minLength={2} defaultValue={person.taskLabel??""}
              placeholder="Ex.: Fotos, redação, vídeo"/>
            <button type="submit" disabled={isPending}>Salvar</button>
          </form>
        ))}
      </div>
    </details>;
  }

  function EventEdit({ item }: { item: AgendaEventItem }): JSX.Element {
    return (
      <details className="agenda-inline-edit">
        <summary>Editar</summary>
        <form
          className="agenda-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            run(() => updateAgendaEventAction(item.id, new FormData(form)), "Compromisso atualizado.");
          }}
        >
          <input type="hidden" name="updated_at" value={item.updatedAt} />
          <label className="agenda-field agenda-field-wide"><span>Compromisso</span><input name="title" required maxLength={180} defaultValue={item.title} /></label>
          <div className="agenda-datetime-row">
            <label className="agenda-field"><span>Data</span><input name="event_date" type="date" required defaultValue={item.eventDate} /></label>
            <label className="agenda-field"><span>Início</span><input name="start_time" type="time" defaultValue={item.startTime ?? ""} /></label>
            <label className="agenda-field"><span>Fim</span><input name="end_time" type="time" defaultValue={item.endTime ?? ""} /></label>
          </div>
          <label className="agenda-field"><span>Lembrete no grupo Telegram</span><select name="reminder_minutes" defaultValue={item.reminderMinutes === null ? "off" : String(item.reminderMinutes)}><option value="off">Sem lembrete</option><option value="0">No horário</option><option value="5">5 min antes</option><option value="10">10 min antes</option><option value="15">15 min antes</option><option value="30">30 min antes</option><option value="60">1 hora antes</option><option value="120">2 horas antes</option><option value="1440">1 dia antes</option></select></label>
          <label className="agenda-field agenda-field-wide"><span>Local</span><input name="location" maxLength={240} defaultValue={item.location ?? ""} /></label>
          <label className="agenda-field agenda-field-wide"><span>Observação</span><textarea name="description" maxLength={4000} defaultValue={item.description ?? ""} /></label>
          {item.coverage?<p className="helper-text agenda-field-wide">Responsáveis da cobertura são alterados pela transferência, não pela edição geral.</p>:
            <div className="agenda-field-wide"><AssigneePicker profiles={data.profiles} selectedIds={item.assignees.map((profile) => profile.id)} /></div>}
          <div className="agenda-form-actions agenda-edit-actions">
            <button type="submit" className="agenda-primary" disabled={isPending}>Salvar</button>
            <button type="button" className="agenda-close-edit" disabled={isPending} onClick={(event) => {
              event.currentTarget.closest("form")?.reset();
              const details = event.currentTarget.closest("details");
              if (details instanceof HTMLDetailsElement) details.open = false;
            }}>Fechar</button>
          </div>
        </form>
      </details>
    );
  }

  function InviteesEditor({item}:{item:AgendaEventItem}):JSX.Element{
    return <details className="agenda-inline-edit">
      <summary>Convidar para reunião · {item.invitees.length} pessoa(s)</summary>
      <form className="agenda-form" onSubmit={event=>{
        event.preventDefault();
        const ids=[...new FormData(event.currentTarget).getAll("invitee_ids")]
          .filter((id):id is string=>typeof id==="string");
        run(()=>setAgendaMeetingInviteesAction(item.id,ids),"Convidados atualizados no sistema.");
      }}>
        <p className="helper-text">Os convidados podem aceitar ou recusar na Agenda. Quem ativou o Web Push e os avisos da Agenda poderá receber uma notificação individual; não é enviado e-mail nem mensagem individual no Telegram.</p>
        <fieldset className="agenda-assignees">
          <legend>Convidados da reunião</legend>
          <div className="agenda-assignee-options">
            {data.profiles.map(profile=><label key={profile.id} className="agenda-person-option">
              <input type="checkbox" name="invitee_ids" value={profile.id}
                defaultChecked={item.invitees.some(inv=>inv.id===profile.id)}/>
              <span className="agenda-person-name">{profile.name}</span>
            </label>)}
          </div>
        </fieldset>
        <button type="submit" className="agenda-primary" disabled={isPending}>Salvar convidados</button>
      </form>
    </details>;
  }

  function PautaEdit({ item }: { item: WeeklyPautaItem }): JSX.Element {
    return (
      <details className="agenda-inline-edit pauta-inline-edit">
        <summary>Editar</summary>
        <form
          className="agenda-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            run(() => updatePautaItemAction(item.id, new FormData(form)), "Pauta atualizada.");
          }}
        >
          <input type="hidden" name="week_start" value={item.weekStart} />
          <input type="hidden" name="updated_at" value={item.updatedAt} />
          <div className="pauta-form-heading">
            <label className="agenda-field pauta-title-field"><span>O que precisa ser feito?</span>
              <input name="title" required maxLength={180} defaultValue={item.title} /></label>
            <PautaDateTimeField initialDate={item.dueDate ?? item.weekStart} initialTime={item.dueTime}
              weekStart={data.periodStart} weekEnd={data.periodEnd} />
          </div>
          {item.coverage?<p className="helper-text agenda-field-wide">Para mudar o responsável da cobertura, utilize Transferir responsabilidade.</p>:
            <div className="agenda-field-wide"><AssigneePicker profiles={data.profiles} selectedIds={item.assignees.map((person) => person.id)} /></div>}
          <label className="agenda-field pauta-note-field"><span>Observações</span>
            <textarea name="description" rows={2} maxLength={4000} defaultValue={item.description ?? ""}
              onInput={(event) => {
                const target = event.currentTarget;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 300) + "px";
              }} /></label>
          <div className="agenda-form-actions agenda-edit-actions">
            <button type="submit" className="agenda-primary" disabled={isPending}>Salvar</button>
            <button type="button" className="agenda-close-edit" disabled={isPending} onClick={(event) => {
              event.currentTarget.closest("form")?.reset();
              const details = event.currentTarget.closest("details");
              if (details instanceof HTMLDetailsElement) details.open = false;
            }}>Fechar</button>
          </div>
        </form>
      </details>
    );
  }

  return (
    <section className={"agenda-workspace" + (initialView === "pauta" ? " is-pauta-workspace" : "")}>
      <datalist id="agenda-task-suggestions">
        <option value="Fotos"/><option value="Vídeo"/><option value="Entrevistas"/>
        <option value="Fotos / cobertura"/><option value="Produção da matéria"/>
        <option value="Acompanhamento"/><option value="Cobertura jornalística"/>
      </datalist>
      {data.pendingInvitations.length > 0 ? (
        <section className="agenda-overdue-notice" aria-labelledby="pending-meetings-title">
          <div>
            <strong id="pending-meetings-title">
              {data.pendingInvitations.length} convite(s) de reunião aguardando sua resposta
            </strong>
            <p className="helper-text">Confirme sua presença ou recuse, inclusive para reuniões de outros meses.</p>
            {data.pendingInvitations.map(invitation=>(
              <div key={invitation.eventId} className="agenda-event-meta">
                <span>
                  {invitation.title} · {shortDate(invitation.eventDate)}
                  {invitation.startTime ? " · "+invitation.startTime+"h" : ""}
                  {invitation.location ? " · "+invitation.location : ""}
                </span>
                {data.access.agendaRead ? (
                  <Link href={"/sistema/agenda?date="+invitation.eventDate}>Ver reunião</Link>
                ):null}
                <button type="button" disabled={isPending}
                  onClick={()=>run(()=>respondAgendaInvitationAction(invitation.eventId,"accepted"),"Presença confirmada.")}>
                  Aceitar
                </button>
                <button type="button" disabled={isPending}
                  onClick={()=>run(()=>respondAgendaInvitationAction(invitation.eventId,"declined"),"Recusa registrada.")}>
                  Recusar
                </button>
              </div>
            ))}
          </div>
        </section>
      ):null}
      <div className="agenda-quick-overview" aria-label="Resumo dos compromissos">
        <div><span>Hoje</span><strong>{todayCount}</strong><small>compromissos</small></div>
        <div><span>Minha fila</span><strong>{ownPending}</strong><small>pendências</small></div>
        <div className="agenda-quick-sync" title="Atualizacao automatica e sincronizacao ao retomar a aba">
          <span className={"agenda-sync-dot is-" + realtimeState} />
          <strong>{realtimeState === "online" ? "Conectado" : realtimeState === "connecting" ? "Conectando" : "Sem conexão em tempo real"}</strong>
          <small>{realtimeState === "online" ? "Atualiza no máximo 1 vez por minuto" : "Verifica ao reconectar ou voltar à aba"}</small>
        </div>
      </div>
      {initialView === "agenda" ? (
      <div className="agenda-topbar">
        <div className="agenda-tabs" role="tablist" aria-label="Agenda e pauta">
          {data.access.agendaRead ? <button type="button" className={initialView === "agenda" ? "is-active" : ""} onClick={() => navigate("agenda", data.focusDate)}>Agenda</button> : null}
          {data.access.pautaRead ? <button type="button" onClick={() => navigate("pauta", data.focusDate)}>Pauta da semana</button> : null}
        </div>
        <label className="agenda-person-filter">
          <span>Mostrar</span>
          <select aria-label="Filtrar por responsável" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}>
            <option value="">Toda a equipe</option>
            <option value={data.currentUserId}>Somente meus itens</option>
            {data.profiles.filter((profile) => profile.id !== data.currentUserId).map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
        {(initialView === "agenda" ? data.access.agendaWrite : data.access.pautaWrite) ? (
          <button type="button" className="agenda-top-add" onClick={openCreate}>{initialView === "agenda" ? "+ Compromisso" : "+ Nova pauta"}</button>
        ) : null}
      </div>
      ) : null}

      {remoteChanges ? (
        <div className="agenda-remote-notice agenda-remote-notice--floating" role="status" aria-live="polite">
          <span><strong>Alterações de outros usuários</strong><small>Salve ou feche a edição para sincronizar sem perder suas informações.</small></span>
          <button type="button" onClick={async () => {
            if (hasDirtyAgendaForm()) {
              const accept = await confirmDialog({
                title: "Descartar alterações ainda não salvas e atualizar?",
                confirmLabel: "Atualizar",
                cancelLabel: "Continuar editando",
              });
              if (!accept) return;
            }
            setRemoteChanges(false);
            lastSyncAtRef.current = Date.now();
            router.refresh();
          }}>Atualizar</button>
          <button type="button" className="agenda-remote-dismiss" aria-label="Dispensar aviso" onClick={() => setRemoteChanges(false)}>×</button>
        </div>
      ) : null}
      {initialView === "agenda" && data.access.agendaRead ? (
        <div className="agenda-layout">
          <div className="agenda-calendar-card">
            <div className="agenda-calendar-head">
              <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button>
              <div>
                <strong>{monthLabel(data.focusDate)}</strong>
                <span>{monthEventCount} compromisso{monthEventCount === 1 ? "" : "s"} no mês</span>
                <button type="button" className="agenda-month-toggle" aria-expanded={isMonthExpanded} aria-controls="agenda-month-detail" onClick={() => setIsMonthExpanded((expanded) => !expanded)}>{isMonthExpanded ? "Fechar mês" : "Ver mês"}</button>
              </div>
              <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button>
            </div>

            <div className="agenda-week-strip" aria-label="Semana selecionada">
              <button type="button" className="agenda-week-step" aria-label="Semana anterior" onClick={() => navigate("agenda", addDays(selectedDate, -7))}>‹</button>
              <div className="agenda-week-dates">
                {selectedWeekDays.map((day, index) => {
                  const count = (eventsByDate.get(day) ?? []).filter((event) => event.status !== "cancelled").length;
                  return (
                    <button type="button" key={day} aria-label={longDate(day)} aria-pressed={selectedDate === day}
                      className={"agenda-week-date" + (selectedDate === day ? " is-selected" : "") + (day === data.today ? " is-today" : "")}
                      onClick={() => {
                        if (day < data.monthStart || day > data.monthEnd) navigate("agenda", day);
                        else setSelectedDate(day);
                      }}>
                      <small>{["S", "T", "Q", "Q", "S", "S", "D"][index]}</small>
                      <strong>{parseDate(day).getDate()}</strong>
                      {count > 0 ? <i aria-label={count + " compromissos"} /> : null}
                    </button>
                  );
                })}
              </div>
              <button type="button" className="agenda-week-step" aria-label="Próxima semana" onClick={() => navigate("agenda", addDays(selectedDate, 7))}>›</button>
            </div>
            <div id="agenda-month-detail" className={"agenda-month-detail" + (isMonthExpanded ? " is-expanded" : "")}>
              <div className="agenda-weekdays">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="agenda-month-grid">
              {days.map((day) => {
                const dayEvents = eventsByDate.get(day.value) ?? [];
                const activeEvents = dayEvents.filter((event) => event.status !== "cancelled");
                const classes = ["agenda-day"];
                if (!day.currentMonth) classes.push("is-outside");
                if (day.value === selectedDate) classes.push("is-selected");
                if (day.value === data.today) classes.push("is-today");
                return (
                  <button type="button" key={day.value} className={classes.join(" ")} onClick={() => {
                    if (day.value < data.monthStart || day.value > data.monthEnd) navigate("agenda", day.value);
                    else setSelectedDate(day.value);
                  }}>
                    <span className="agenda-day-number">{day.day}</span>
                    {activeEvents.length ? <span className="agenda-day-count">{activeEvents.length}</span> : null}
                    {activeEvents.length ? <span className="agenda-day-colors" aria-hidden="true">
                      {activeEvents.slice(0, 4).map((event) => <i key={event.id} style={{ background: personColor(event.assignees[0]?.id ?? "") }} />)}
                    </span> : null}
                  </button>
                );
              })}
            </div>
            </div>
            <button type="button" className="agenda-today-button" onClick={() => navigate("agenda", data.today)}>Hoje</button>
          </div>

          <div className="agenda-side-column">
            <div className="agenda-day-panel">
              <div className="agenda-section-title"><p className="eyebrow">COMPROMISSOS</p><h2>{longDate(selectedDate)}</h2></div>
              {selectedEvents.length ? (
                <div className="agenda-events-list">
                  {selectedEvents.map((item) => (
                    <details key={item.id} className={"agenda-event-card is-" + item.status + (eventOverdue(item, localClock) ? " is-overdue" : "")}
                      style={{ borderLeftColor: personColor(item.assignees[0]?.id ?? "") }}>
                      <summary className="workflow-collapsed-summary">
                        <span>{item.title}</span>
                        <span className="workflow-expand-chevron" aria-hidden="true">⌄</span>
                      </summary>
                      <div className="workflow-expanded-body">
                      <div className="agenda-event-main">
                        <div className="agenda-event-time">{item.startTime ? item.startTime + "h" : "—"}{item.endTime ? <small>até {item.endTime}h</small> : null}</div>
                        <div>
                          <h3>{item.title}</h3>
                          <div className="agenda-event-meta">
                            {item.location ? <span>{item.location}</span> : null}
                            {item.assignees.length ? <span className="agenda-assignee-row">
                              {item.assignees.map((person) => (
                                <span className="agenda-assignee-chip" key={person.id} style={{ borderColor: personColor(person.id), color: personColor(person.id) }}>
                                  {person.completedAt ? "✓ " : ""}{person.name}{person.taskLabel?" · "+person.taskLabel:""}
                                </span>
                              ))}
                            </span> : <span>Sem responsável</span>}
                            <span className={"agenda-event-state" + (eventOverdue(item, localClock) ? " is-overdue" : "")}>
                              {eventOverdue(item, localClock) ? "⚠ " : ""}{statusLabel(item.status, eventOverdue(item, localClock))}
                              {item.assignees.length > 1 ? ` · ${item.assignees.filter((person) => person.completedAt).length}/${item.assignees.length} concluídos` : ""}
                            </span>
                          </div>
                          {item.description ? <details className="agenda-event-details"><summary>Visualizar detalhes</summary><p>{item.description}</p></details> : null}
                          {item.invitees.length ? <div className="agenda-event-meta" aria-label="Confirmações de reunião">
                            {item.invitees.map(person=><span key={person.id} className="agenda-assignee-chip">
                              {person.name}: {person.response==="accepted"?"aceitou":person.response==="declined"?"recusou":"pendente"}
                            </span>)}
                          </div>:null}
                          {item.status==="scheduled" && item.invitees.some(person=>person.id===data.currentUserId)?
                            <div className="agenda-event-actions">
                              <button disabled={isPending} type="button"
                               onClick={()=>run(()=>respondAgendaInvitationAction(item.id,"accepted"),"Presença confirmada.")}>Aceitar convite</button>
                              <button disabled={isPending} type="button"
                               onClick={()=>run(()=>respondAgendaInvitationAction(item.id,"declined"),"Recusa registrada.")}>Recusar convite</button>
                            </div>:null}
                        </div>
                      </div>
                      {!item.coverage && item.workflowKind==="general" && (data.access.agendaWrite || item.assignees.some((person) => person.id === data.currentUserId)) ? (
                        <div className={"agenda-event-actions" + (data.access.agendaWrite ? " is-manager" : " is-member")}>
                          {item.status === "scheduled" ? (
                            <>
                              {item.assignees.some((person) => person.id === data.currentUserId && !person.completedAt) ? (
                                <button type="button" className="agenda-complete-button" disabled={isPending}
                                  onClick={() => run(() => completeMyAgendaAssignmentAction(item.id),
                                    item.assignees.length>1?"Sua responsabilidade foi concluída.":"Compromisso concluído.")}>
                                  ✓ {item.assignees.length>1
                                    ? (item.assignees.find(p=>p.id===data.currentUserId)?.taskLabel
                                        ? "Concluir "+item.assignees.find(p=>p.id===data.currentUserId)!.taskLabel!
                                        : "Concluir minha parte")
                                    : "Concluir compromisso"}
                                </button>
                              ) : null}
                              {data.access.agendaWrite ? (
                                <>
                                  {item.assignees.length===0 ||
                                    (item.assignees.length===1 && !item.assignees.some(p=>p.id===data.currentUserId))
                                    ? <button type="button" className="agenda-manager-finish" disabled={isPending}
                                      onClick={() => run(() => setAgendaEventStatusAction(item.id, "completed"),
                                        "Compromisso encerrado pela administração.")}>
                                        ✓ Encerrar compromisso
                                      </button> : null}
                                  <button type="button" className="agenda-manager-cancel" disabled={isPending}
                                    aria-label={"Cancelar compromisso: " + item.title}
                                    title="Cancelar compromisso"
                                    onClick={async () => {
                                      const confirmed = await confirmDialog({
                                        title: "Cancelar o compromisso \"" + item.title + "\"?",
                                        confirmLabel: "Cancelar compromisso",
                                        cancelLabel: "Voltar",
                                      });
                                      if (!confirmed) return;
                                      run(() => setAgendaEventStatusAction(item.id, "cancelled"), "Compromisso cancelado.");
                                    }}>
                                    ×
                                  </button>
                                </>
                              ) : null}
                            </>
                          ) : data.access.agendaWrite ? (
                            <button type="button" disabled={isPending}
                              onClick={() => run(() => setAgendaEventStatusAction(item.id, "scheduled"), "Compromisso reaberto.")}>Reabrir</button>
                          ) : null}
                        </div>
                      ) : null}
                      {item.status === "scheduled" && item.workflowKind==="general" && !item.coverage && data.access.pautaWrite && item.eventKind !== "editorial" ? (
                        <div className="agenda-event-secondary">
                          <button type="button" disabled={isPending}
                            onClick={() => run(() => createPautaFromAgendaEventAction(item.id), "Compromisso incluído na pauta.")}>
                            + Incluir na Pauta
                          </button>
                        </div>
                      ) : null}
                      {item.workflowKind!=="general"
                        ? <EditorialWorkflowPanel item={item} currentUserId={data.currentUserId}
                            manager={data.access.workflowManage} profiles={data.profiles}
                            isPending={isPending} onAction={run} mode="agenda"
                            showPautaLink={data.access.pautaRead}/>
                        :item.coverage?CoveragePanel({coverage:item.coverage,eventId:item.id,eventTime:item.startTime??""})
                        :item.status==="scheduled"&&data.access.agendaWrite?EnableCoverage({item}):null}
                      {data.access.agendaWrite&&item.workflowKind==="general"&&!item.coverage&&item.status==="scheduled"&&item.assignees.length>1
                        ? AssignmentRoles({item}) : null}
                      {data.access.agendaWrite && item.workflowKind==="general" ? EventEdit({item}) : null}
                      {data.access.agendaWrite && item.workflowKind==="general" && !item.coverage && item.eventKind==="general" && item.status==="scheduled"
                        ? InviteesEditor({item}) : null}
                      </div>
                    </details>
                  ))}
                </div>
              ) : <div className="agenda-empty">Nenhum compromisso neste dia.</div>}
            </div>

            {data.access.agendaWrite ? <details className="agenda-create-panel" id="agenda-create-panel">
              <summary>＋ Novo compromisso <span>Escolher tipo e responsáveis</span></summary>
              <EditorialWorkflowCreate profiles={data.profiles}
                currentUserId={data.currentUserId} weekStart={data.weekStart}
                selectedDate={selectedDate} view="agenda" isPending={isPending}
                onCreate={form=>run(()=>createEditorialWorkflowAction(form),"Compromisso cadastrado.")}/>
            </details>:null}
          </div>
        </div>
      ) : (
        <div className="pauta-layout">
          <div className="pauta-toolbar">
            <div className="agenda-tabs" role="tablist" aria-label="Agenda e pauta">
              {data.access.agendaRead ? <button type="button" onClick={() => navigate("agenda", data.focusDate)}>Agenda</button> : null}
              {data.access.pautaRead ? <button type="button" className="is-active" aria-current="page">Pauta da semana</button> : null}
            </div>
            <div className="pauta-toolbar-period">
              <button type="button" className="pauta-week-arrow" onClick={() => moveWeek(-1)} aria-label="Semana anterior">‹</button>
              <div className="pauta-toolbar-dates">
                <strong>{shortDate(data.periodStart)} a {shortDate(data.periodEnd)}</strong>
                <small>{data.periodEdited ? "PERÍODO ESPECIAL" : "QUI – QUA"}</small>
              </div>
              <button type="button" className="pauta-week-arrow" onClick={() => moveWeek(1)} aria-label="Próxima semana">›</button>
              {data.access.pautaWrite ? <button type="button" className="pauta-period-pencil" aria-expanded={isPeriodEditorOpen}
                aria-label="Editar as datas somente desta semana" title="Alterar período para toda a equipe"
                onClick={() => setIsPeriodEditorOpen((open) => !open)}>✎</button> : null}
            </div>
            <label className="agenda-person-filter pauta-toolbar-filter">
              <span>Mostrar</span>
              <select aria-label="Filtrar por responsável" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}>
                <option value="">Toda a equipe</option>
                <option value={data.currentUserId}>Somente meus itens</option>
                {data.profiles.filter((profile) => profile.id !== data.currentUserId).map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
          </div>
          {isPeriodEditorOpen && data.access.pautaWrite ? (
            <form className="pauta-period-form" key={data.weekStart}
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                run(() => savePautaPeriodAction(new FormData(form)), "Período atualizado para toda a equipe.", () => setIsPeriodEditorOpen(false));
              }}>
              <strong>Ajustar apenas esta semana</strong>
              <p>O padrão das outras semanas permanece de quinta a quarta. As pautas já cadastradas são preservadas.</p>
              <input type="hidden" name="week_start" value={data.weekStart} />
              <div className="pauta-period-fields">
                <label>Início <input type="date" name="period_start" defaultValue={data.periodStart}
                  min={addDays(data.weekStart,-3)} max={addDays(data.weekStart,6)} required /></label>
                <label>Fim <input type="date" name="period_end" defaultValue={data.periodEnd}
                  min={addDays(data.weekStart,-3)} max={addDays(data.weekStart,10)} required /></label>
              </div>
              <label className="pauta-period-reason">Motivo da exceção
                <input name="reason" maxLength={300} defaultValue={data.periodReason ?? ""}
                  placeholder="Ex.: fechamento antecipado da edição" /></label>
              <div className="pauta-period-actions">
                {data.periodEdited ? <button type="button" disabled={isPending} onClick={() => {
                  const reset = new FormData();
                  reset.set("week_start", data.weekStart);
                  reset.set("period_start", data.weekStart);
                  reset.set("period_end", data.weekEnd);
                  reset.set("reason", "Restaurar período padrão");
                  run(() => savePautaPeriodAction(reset), "Semana restaurada ao padrão.", () => setIsPeriodEditorOpen(false));
                }}>Restaurar padrão</button> : null}
                <button type="button" onClick={() => setIsPeriodEditorOpen(false)}>Cancelar</button>
                <button type="submit" className="agenda-primary" disabled={isPending}>Salvar para todos</button>
              </div>
            </form>
          ) : null}
          <div className="pauta-actions-row">
            <button type="button" className="pauta-week-current" onClick={() => navigate("pauta", data.today)}>Semana atual</button>
            <a href={"/tv/pauta?date="+encodeURIComponent(data.focusDate)} target="_blank" rel="noopener noreferrer" className="pauta-tv-link">▣ Modo TV 9:16</a>
            <span>{pautaItems.filter((item) => item.status === "pending").length} pendente(s)</span>
          </div>

          {data.access.pautaWrite?<details className="pauta-create-panel" id="pauta-create-panel">
            <summary>＋ Nova matéria <span>Responsável e prazo opcional</span></summary>
            <EditorialWorkflowCreate profiles={data.profiles}
              currentUserId={data.currentUserId} weekStart={data.weekStart}
              selectedDate={initialPautaDate} view="pauta" isPending={isPending}
              onCreate={form=>run(()=>createEditorialWorkflowAction(form),"Pauta cadastrada.")}/>
          </details>:null}

          {pautaItems.length ? (
            <div className="pauta-list">
              {pautaItems.map((item) => {
                const done = item.status === "completed";
                const cancelled = item.status === "cancelled";
                const myAssignment = item.assignees.find((person) => person.id === data.currentUserId);
                const canCompleteOwn = !done && !cancelled && Boolean(myAssignment && !myAssignment.completedAt);
                return (
                  <details key={item.id} style={{ borderLeftColor: personColor(item.responsibleProfileId ?? "") }} className={"pauta-item" + (done ? " is-done" : "") + (cancelled ? " is-cancelled" : "")}>
                    <summary className="workflow-collapsed-summary">
                      <span>{item.title}</span>
                      <span className="workflow-expand-chevron" aria-hidden="true">⌄</span>
                    </summary>
                    <div className="workflow-expanded-body pauta-expanded-body">
                    {!item.coverage && !item.workflow && (data.access.pautaWrite || canCompleteOwn) ? <button type="button" className="pauta-check"
                      aria-label={done ? "Reabrir item" : "Concluir minha pauta"} disabled={isPending || cancelled}
                      onClick={() => run(
                        () => done ? setPautaItemStatusAction(item.id, "pending")
                          : data.access.pautaWrite && !canCompleteOwn ? setPautaItemStatusAction(item.id, "completed") : completeMyPautaItemAction(item.id),
                        done ? "Item reaberto." : "Item concluído.",
                      )}>{done ? "✓" : ""}</button> : <span className="pauta-check-placeholder" aria-hidden="true">{done ? "✓" : ""}</span>}
                    <div className="pauta-item-content">
                      <div className="pauta-item-topline"><strong>{item.title}</strong><span className="agenda-assignee-row">
                          {item.assignees.length ? item.assignees.map((person) => (
                            <span key={person.id} className="agenda-assignee-chip" style={{ borderColor: personColor(person.id), color: personColor(person.id) }}>
                              {person.completedAt ? "✓ " : ""}{person.name}{person.taskLabel?" · "+person.taskLabel:""}
                            </span>
                          )) : <span className="agenda-assignee-chip">Sem responsável</span>}
                        </span></div>
                      <div className="pauta-item-meta">
                        <span>{item.dueDate ? longDate(item.dueDate) : "Sem dia definido"}</span>
                        {item.dueTime ? <span>{item.dueTime}h</span> : null}
                        <span className={pautaOverdue(item, localClock) ? "is-overdue" : ""}>
                          {done ? "Concluída" : cancelled ? "Cancelada" : pautaOverdue(item, localClock) ? "⚠ Atrasada" : item.assignees.some((person) => person.completedAt) ? "Em andamento" : "Pendente"}
                        </span>
                      </div>
                      {item.description ? <p>{item.description}</p> : null}
                      {item.articleId ? (
                        <Link href={"/sistema/editorial/materias/" + item.articleId} className="agenda-link-materia">Abrir matéria vinculada ↗</Link>
                      ) : null}
                      {item.workflow?
                        <EditorialWorkflowPanel item={item.workflow} currentUserId={data.currentUserId}
                          manager={data.access.workflowManage} profiles={data.profiles}
                          isPending={isPending} onAction={run} mode="pauta"/>:
                        item.coverage&&item.agendaEventId?CoveragePanel({coverage:item.coverage,eventId:item.agendaEventId,eventTime:item.dueTime??""}):
                        item.agendaEventId&&data.access.agendaRead?
                          <Link className="agenda-link-materia" href={"/sistema/agenda?date="+
                            encodeURIComponent(item.dueDate??data.today)}>
                            Ver compromisso na Agenda
                          </Link>:null}
                      {data.access.pautaWrite && !item.workflow ? PautaEdit({item}) : null}
                    </div>
                    {data.access.pautaWrite && !item.workflow ? <button type="button" className="pauta-cancel" disabled={isPending} onClick={() => run(() => setPautaItemStatusAction(item.id, cancelled ? "pending" : "cancelled"), cancelled ? "Item restaurado." : "Item retirado da pauta.")}>{cancelled ? "↶" : "×"}</button> : null}
                    </div>
                  </details>
                );
              })}
            </div>
          ) : <div className="agenda-empty">Nenhuma pauta registrada para esta semana.</div>}
        </div>
      )}
    </section>
  );
}
