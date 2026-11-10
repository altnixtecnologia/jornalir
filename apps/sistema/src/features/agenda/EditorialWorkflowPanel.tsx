"use client";

import {useState} from "react";
import type {AgendaEventItem,AgendaProfile} from "./agendaTypes";
import type {AgendaActionResult} from "./actions";
import {
 answerEditorialWorkflowPresenceAction,
 closeEditorialWorkflowAction,
 updateEditorialWorkflowDeadlineAction,
 adjustEditorialWorkflowTaskAction,
 reorderEditorialWorkflowTasksAction,
} from "./actions";
import type {CoverageTaskDraft} from "./coverageTaskCatalog";
import {WorkflowTaskChips} from "./WorkflowTaskChips";

const names:Record<string,string>={
 event:"Evento",council:"Sessão da Câmara",visit:"Visita",article:"Só matéria",
};
const attendance:Record<string,string>={
 pending:"Aguardando resposta",present:"Compareceu",absent:"Não compareceu",
 not_required:"Dispensado",unconfirmed:"Não confirmou",
};

type Editing={owner:string;task:CoverageTaskDraft};
function parts(iso:string|null,explicit:boolean):{date:string;time:string}{
 if(!iso)return {date:"",time:""};
 const parsed=new Date(iso);
 const date=new Intl.DateTimeFormat("sv-SE",{
  timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
 }).format(parsed);
 const time=explicit?new Intl.DateTimeFormat("sv-SE",{
  timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hourCycle:"h23",
 }).format(parsed):"";
 return {date,time};
}

export function EditorialWorkflowPanel({item,currentUserId,manager,profiles,
 isPending,onAction}:{
 item:AgendaEventItem;currentUserId:string;manager:boolean;
 profiles:AgendaProfile[];isPending:boolean;
 onAction:(action:()=>Promise<AgendaActionResult>,success:string)=>void;
}):JSX.Element {
 const writer=item.articleOwnerId===currentUserId;
 const [menu,setMenu]=useState<Editing|null>(null);
 const [rename,setRename]=useState("");
 const [editMode,setEditMode]=useState(false);
 const [deadlineDate,setDeadlineDate]=useState(parts(item.articleDueAt,item.articleDueTimeExplicit).date);
 const [deadlineTime,setDeadlineTime]=useState(parts(item.articleDueAt,item.articleDueTimeExplicit).time);
 const [showDeadline,setShowDeadline]=useState(false);
 const name=(id:string|null)=>profiles.find(p=>p.id===id)?.name??"Colaborador";
 const closed=Boolean(item.workflowClosedAt);
 const openMenu=(owner:string,task:CoverageTaskDraft)=>{
   setMenu({owner,task});setRename(task.label);setEditMode(false);
 };
 const submitTask=(action:"edit"|"delete")=>{
   if(!menu)return;
   onAction(()=>adjustEditorialWorkflowTaskAction(
     item.id,menu.owner,menu.task.kind,menu.task.label,action,null,
     action==="edit"?rename:null,
   ),action==="delete"?"Função excluída.":"Função editada.");
   setMenu(null);
 };
 const reorder=(owner:string,tasks:CoverageTaskDraft[])=>{
   onAction(()=>reorderEditorialWorkflowTasksAction(item.id,owner,tasks.map(task=>task.label)),
     "Ordem das funções atualizada.");
 };
 const usePresence=(id:string,answer:"present"|"absent"|"not_required")=>
   onAction(()=>answerEditorialWorkflowPresenceAction(item.id,id,answer),"Participação registrada.");
 const close=()=>onAction(
  ()=>closeEditorialWorkflowAction(item.id,!closed),
  closed?"Compromisso reaberto.":"Cobertura encerrada. Sem resposta foi registrado como Não confirmou."
 );
 const dueInitial=parts(item.articleDueAt,item.articleDueTimeExplicit);
 return <section className="workflow-quick-panel" aria-label={"Controle de "+(names[item.workflowKind]??"compromisso")}>
   <header className="workflow-quick-header">
    <strong>{names[item.workflowKind]??"Compromisso"}</strong>
    {item.councilCity?<span>{item.councilCity}</span>:null}
    {closed?<span className="workflow-closed-tag">✓ Encerrado</span>:null}
   </header>
   {item.workflowKind!=="article"?
    <div className="workflow-attendance-list">
      {item.assignees.map(person=>{
        const canRespond=manager||person.id===currentUserId&&!closed;
        const needsPresence=person.attendanceResponse!=="not_required";
        const didNotConfirm=person.attendanceResponse==="unconfirmed";
        return <div className="workflow-attendance-person" key={person.id}>
          <div className="workflow-person-line">
            <strong>{person.name}</strong>
            {person.id===item.articleOwnerId?<small>Redação da matéria</small>:null}
            <span className={didNotConfirm?"workflow-unconfirmed":"workflow-attendance-status"}>
              {attendance[person.attendanceResponse]}
            </span>
          </div>
          {needsPresence&&canRespond?<div className="workflow-presence-buttons">
            {([
             ["present","Compareci"],["absent","Não fui"],["not_required","Dispensado"],
            ] as const).map(([answer,label])=><button type="button" key={answer}
              className={person.attendanceResponse===answer?"is-selected":""}
              aria-pressed={person.attendanceResponse===answer}
              disabled={isPending} onClick={()=>usePresence(person.id,answer)}>
              {label}
            </button>)}
          </div>:null}
          {person.workflowTasks.length>0?
            <WorkflowTaskChips tasks={person.workflowTasks}
              editable={manager&&!closed&&!isPending}
              onReorder={tasks=>reorder(person.id,tasks)}
              onLongPress={task=>openMenu(person.id,task)}/>:null}
          {menu?.owner===person.id?<div className="workflow-task-context">
            <strong>{menu.task.label}</strong>
            {editMode?<div className="workflow-custom-add">
              <input maxLength={80} value={rename} onChange={e=>setRename(e.currentTarget.value)}/>
              <button type="button" onClick={()=>submitTask("edit")} disabled={isPending}>Salvar</button>
            </div>:<div className="workflow-task-menu-actions">
              <button type="button" onClick={()=>setEditMode(true)}>Editar</button>
              <button type="button" disabled={isPending} onClick={()=>submitTask("delete")}>Excluir</button>
              <button type="button" onClick={()=>setMenu(null)}>Fechar</button>
            </div>}
          </div>:null}
        </div>;
      })}
    </div>:null}
   {item.articleOwnerId?<div className="workflow-article-status">
     <div className="workflow-article-top">
       <div><strong>Matéria</strong>
         <small>Responsável: {name(item.articleOwnerId)}</small>
         {item.articleDueAt?<small>Prazo: {dueInitial.date}{dueInitial.time?" às "+dueInitial.time+"h":""}</small>:
           <small>Sem prazo específico</small>}
       </div>
       {(writer||manager)?<button type="button" className="agenda-primary"
         disabled={isPending} onClick={close}>
           {closed?"Reabrir matéria":"✓ Concluir matéria e encerrar"}
       </button>:null}
     </div>
     {(writer||manager)?<details open={showDeadline} onToggle={e=>setShowDeadline(e.currentTarget.open)}
       className="workflow-deadline-edit">
       <summary>Alterar prazo (opcional)</summary>
       <form onSubmit={e=>{
         e.preventDefault();
         onAction(()=>updateEditorialWorkflowDeadlineAction(item.id,new FormData(e.currentTarget)),"Prazo atualizado.");
         setShowDeadline(false);
       }}>
         <label className="agenda-field"><span>Data</span>
           <span className="workflow-clearable">
             <input type="date" name="article_due_date" value={deadlineDate} onChange={e=>setDeadlineDate(e.currentTarget.value)}/>
             {deadlineDate?<button type="button" onClick={()=>{setDeadlineDate("");setDeadlineTime("");}} aria-label="Limpar data">×</button>:null}
           </span>
         </label>
         <label className="agenda-field"><span>Hora</span>
           <span className="workflow-clearable">
             <input type="time" name="article_due_time" value={deadlineTime} onChange={e=>setDeadlineTime(e.currentTarget.value)}/>
             {deadlineTime?<button type="button" onClick={()=>setDeadlineTime("")} aria-label="Limpar hora">×</button>:null}
           </span>
         </label>
         <button type="submit" disabled={isPending}>Salvar prazo</button>
       </form>
       <small>Vazio significa sem urgência e sem alerta de atraso.</small>
     </details>:null}
   </div>:manager?<div className="workflow-final-actions">
       <button type="button" className="agenda-primary" disabled={isPending} onClick={close}>
         {closed?"Reabrir compromisso":"✓ Encerrar compromisso"}
       </button>
     </div>:null}
   {closed?<p className="workflow-closure-note">
     Encerrado {item.workflowClosedBy?"por "+name(item.workflowClosedBy):""}.
     Quem não respondeu está registrado como <strong>Não confirmou</strong>, sem indicação automática de falta.
   </p>:null}
 </section>;
}
