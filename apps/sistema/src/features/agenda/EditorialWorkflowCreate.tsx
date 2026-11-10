"use client";

import {useRef,useState,type FormEvent} from "react";
import type {AgendaProfile,AgendaEventItem,EditorialWorkflowKind} from "./agendaTypes";
import {FIXED_COVERAGE_TASKS,type CoverageTaskDraft} from "./coverageTaskCatalog";
import {WorkflowTaskChips} from "./WorkflowTaskChips";

type Choice=Exclude<EditorialWorkflowKind,"general">;
type CrewMember={key:number;profileId:string;attends:boolean;tasks:CoverageTaskDraft[]};
type EditingTask={member:number;kind:string;label:string};
const TYPES:{key:Choice;name:string;note:string}[]=[
 {key:"event",name:"Evento",note:"Participação e matéria opcional"},
 {key:"council",name:"Sessão da Câmara",note:"Agenda semanal das Câmaras"},
 {key:"visit",name:"Visita",note:"Entrevista, reunião, comércio ou podcast"},
 {key:"article",name:"Só matéria",note:"Pauta sem presença"},
];
const CITIES=[
 "Morrinhos do Sul/RS","Mampituba/RS","Praia Grande/SC",
 "São João do Sul/SC","Santa Rosa do Sul/SC","Torres/RS","Passo de Torres/SC",
] as const;

export function EditorialWorkflowCreate({
 profiles,currentUserId,weekStart,selectedDate,view,isPending,onCreate,existing,initialWriterId,
}:{
 profiles:AgendaProfile[];
 currentUserId:string;
 weekStart:string;selectedDate:string;view:"agenda"|"pauta";isPending:boolean;
 onCreate:(data:FormData)=>void;
 existing?:AgendaEventItem;
 initialWriterId?:string;
}):JSX.Element{
 const [kind,setKind]=useState<Choice|null>(view==="pauta"&&!existing?"article":null);
 const [title,setTitle]=useState(existing?.title??"");
 const [city,setCity]=useState("");
 const [eventDate,setEventDate]=useState(existing?.eventDate??selectedDate);
 const [eventTime,setEventTime]=useState(existing?.startTime??"");
 const [endTime,setEndTime]=useState(existing?.endTime??"");
 const [location,setLocation]=useState(existing?.location??"");
 const [notes,setNotes]=useState(existing?.description??"");
 const [writer,setWriter]=useState(initialWriterId??(view==="pauta"?currentUserId:""));
 const [dueDate,setDueDate]=useState("");
 const [dueTime,setDueTime]=useState("");
 const [repeat,setRepeat]=useState(1);
 const initialIds=[...(existing?.assignees.map(p=>p.id)??[])];
 if(initialWriterId&&!initialIds.includes(initialWriterId))initialIds.push(initialWriterId);
 const [crew,setCrew]=useState<CrewMember[]>(initialIds.length?
  initialIds.map((id,index)=>({key:index+1,profileId:id,attends:true,tasks:[]})):
  [{key:1,profileId:currentUserId,attends:true,tasks:[]}]);
 const nextKey=useRef((existing?.assignees.length??0)+2);
 const [menu,setMenu]=useState<EditingTask|null>(null);
 const [customFor,setCustomFor]=useState<number|null>(null);
 const [customText,setCustomText]=useState("");
 const [rename,setRename]=useState("");
 const [error,setError]=useState("");
 const [editing,setEditing]=useState(false);
 const available=profiles.find(profile=>!crew.some(m=>m.profileId===profile.id));
 const setType=(chosen:Choice)=>{
   setKind(chosen);
   setWriter(initialWriterId??"");
   setCrew(prev=>chosen==="article"?[{
     ...prev[0],attends:false,tasks:[],
   }]:prev.map(m=>({...m,attends:true})));
   setMenu(null);setRepeat(1);
 };
 const changeMember=(key:number,patch:Partial<CrewMember>)=>
   setCrew(prev=>prev.map(m=>m.key===key?{...m,...patch}:m));
 const putTask=(key:number,task:CoverageTaskDraft)=>{
   setCrew(prev=>prev.map(m=>{
     if(m.key!==key)return m;
     const has=m.tasks.some(t=>t.kind===task.kind);
     return {...m,tasks:has?m.tasks.filter(t=>t.kind!==task.kind):
       m.tasks.length<8?[...m.tasks,task]:m.tasks};
   }));
 };
 const openMenu=(member:number,task:CoverageTaskDraft)=>{
   setMenu({member,kind:task.kind,label:task.label});
   setRename(task.label);setEditing(false);
 };
 const modifyTask=(action:"edit"|"delete")=>{
   if(!menu)return;
   const old=crew.find(m=>m.key===menu.member)?.tasks.find(
     t=>t.kind===menu.kind&&t.label===menu.label);
   if(!old)return;
   const normalized=rename.trim().replace(/\\s+/g," ");
   if(action==="edit"&&(normalized.length<2||normalized.length>80)){
     setError("A tarefa precisa ter entre 2 e 80 caracteres.");return;
   }
   setCrew(prev=>prev.map(m=>{
     if(m.key!==menu.member)return m;
     const updated=action==="delete"?m.tasks.filter(t=>t!==old):
       m.tasks.map(t=>t===old?{kind:"custom" as const,label:normalized}:t);
     return {...m,tasks:updated};
   }));
   setMenu(null);setEditing(false);setError("");
 };
 const addCustom=(key:number)=>{
   const label=customText.trim().replace(/\s+/g," ");
   const target=crew.find(m=>m.key===key);
   if(!target||label.length<2||label.length>80||target.tasks.length>=8||
      target.tasks.some(t=>t.label.toLocaleLowerCase("pt-BR")===label.toLocaleLowerCase("pt-BR"))){
     setError("Confira a tarefa personalizada (2 a 80 caracteres, sem repetição).");return;
   }
   changeMember(key,{tasks:[...target.tasks,{kind:"custom",label}]});
   setCustomText("");setCustomFor(null);setError("");
 };
 const submit=(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setError("");
  if(!kind){setError("Escolha o tipo de compromisso.");return;}
  if(!writer&&kind==="article"){setError("Marque Matéria no responsável.");return;}
  if(writer&&!crew.some(p=>p.profileId===writer)){setError("Escolha o redator entre os colaboradores.");return;}
  const form=new FormData(e.currentTarget);
  form.set("workflow_kind",kind);
  form.set("workflow_writer",writer);
  form.set("council_repeat",String(kind==="council"?repeat:1));
  form.set("workflow_crew_json",JSON.stringify(crew.map(
    p=>({profileId:p.profileId,attends:kind!=="article"&&p.attends,tasks:p.tasks}))));
  onCreate(form);
 };
 return <form className="workflow-create" onSubmit={submit}>
   {view==="agenda"?<>
   <strong className="workflow-form-label">Que compromisso deseja registrar?</strong>
   <div className="workflow-type-grid" role="group" aria-label="Tipo de compromisso">
    {TYPES.filter(type=>type.key!=="article").map(type=><button type="button" key={type.key}
      className={"workflow-type-choice"+(kind===type.key?" is-selected":"")}
      aria-pressed={kind===type.key} onClick={()=>setType(type.key)}>
      <strong>{type.name}</strong><small>{type.note}</small>
    </button>)}
   </div>
   </>:<strong className="workflow-form-label">Nova matéria para a Pauta</strong>}
   {kind?<div className="workflow-create-body">
     {existing?<p className="workflow-help">Mantém este compromisso, sem criar outro. Título e horário permanecem como cadastrados.</p>:null}
     <input type="hidden" name="week_start" value={weekStart}/>
     {kind==="council"?<label className="agenda-field">
       <span>Município da Câmara</span>
       <select name="council_city" required value={city}
         onChange={e=>{
           const selected=e.currentTarget.value;setCity(selected);
           if(!title||title.startsWith("Sessão da Câmara de Vereadores de "))
             setTitle("Sessão da Câmara de Vereadores de "+selected.split("/")[0]);
         }}>
         <option value="" disabled>Selecionar município</option>
         {CITIES.map(v=><option key={v} value={v}>{v}</option>)}
       </select>
     </label>:null}
     <label className="agenda-field agenda-field-wide"><span>{kind==="visit"?"Quem vamos visitar?":kind==="article"?"Título da matéria":"Compromisso"}</span>
       <input name="title" required maxLength={180} readOnly={Boolean(existing)} value={title}
         onChange={e=>setTitle(e.currentTarget.value)}
         placeholder={kind==="visit"?"Ex.: Visita à prefeitura / entrevista":
          kind==="article"?"Ex.: Matéria para a próxima edição":"Ex.: Cobertura da sessão"}/>
     </label>
     {kind!=="article"?<div className="workflow-schedule">
       <label className="agenda-field"><span>Data do compromisso</span>
         <input type="date" name="event_date" required readOnly={Boolean(existing)} value={eventDate}
           onChange={e=>setEventDate(e.currentTarget.value)}/>
       </label>
       <label className="agenda-field"><span>Início (opcional)</span>
         <span className="workflow-clearable"><input name="start_time" type="time" readOnly={Boolean(existing)} value={eventTime} onChange={e=>setEventTime(e.currentTarget.value)}/>
           {eventTime?<button type="button" aria-label="Limpar início" onClick={()=>setEventTime("")}>×</button>:null}</span>
       </label>
       <label className="agenda-field"><span>Fim (opcional)</span>
         <span className="workflow-clearable"><input name="end_time" type="time" readOnly={Boolean(existing)} value={endTime} onChange={e=>setEndTime(e.currentTarget.value)}/>
           {endTime?<button type="button" aria-label="Limpar fim" onClick={()=>setEndTime("")}>×</button>:null}</span>
       </label>
       {kind==="council"&&!existing?<div className="workflow-repeat">
         <strong>Repetição</strong>
         <div className="workflow-pill-row">
           {[{n:1,label:"Somente esta"},{n:4,label:"4 semanas"},{n:12,label:"12 semanas"}].map(item=>
             <button type="button" key={item.n} aria-pressed={repeat===item.n}
               className={repeat===item.n?"is-selected":""}
               onClick={()=>setRepeat(item.n)}>{item.label}</button>)}
         </div>
       </div>:null}
     </div>:null}
     {kind==="visit"||kind==="event"?<label className="agenda-field">
       <span>Local (opcional)</span>
       <input name="location" maxLength={240} value={location} onChange={e=>setLocation(e.currentTarget.value)}/>
     </label>:null}
     <div className="workflow-person-list">
       <div className="workflow-people-title"><strong>{kind==="article"?"Responsável pela matéria":"Quem participa?"}</strong>
         <small>Um nome por pessoa. Toque nas funções necessárias.</small></div>
       {crew.map((member,index)=>{
         const profile=profiles.find(p=>p.id===member.profileId);
         const isWriter=member.profileId===writer;
         return <section className="workflow-person-card" key={member.key}>
           <div className="workflow-person-top">
             <label className="agenda-field">
               <span>Colaborador {index+1}</span>
               <select value={member.profileId} onChange={e=>{
                 const id=e.currentTarget.value;
                 if(kind==="article"||member.profileId===writer)setWriter(id);
                 changeMember(member.key,{profileId:id});
               }} required>
                 {profiles.filter(p=>p.id===member.profileId||!crew.some(x=>x.key!==member.key&&x.profileId===p.id))
                   .map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
               </select>
             </label>
             {kind!=="article"?<button type="button"
                className={"workflow-attendance-choice"+(member.attends?" is-selected":"")}
                aria-pressed={member.attends}
                onClick={()=>changeMember(member.key,{attends:!member.attends})}>
                 {member.attends?"✓ Vai ao compromisso":"Não precisa ir"}
               </button>:null}
             {crew.length>1?<button type="button" className="workflow-remove-person"
                aria-label="Remover colaborador" onClick={()=>{
                 if(isWriter)setWriter("");
                 setCrew(prev=>prev.filter(p=>p.key!==member.key));
               }}>×</button>:null}
           </div>
           <div className="workflow-function-buttons">
             <WorkflowTaskChips tasks={member.tasks} editable={true}
               onLongPress={task=>openMenu(member.key,task)}
               onReorder={tasks=>changeMember(member.key,{tasks})}/>
             <div className="workflow-pill-row workflow-available-tasks">
               {kind!=="article"?FIXED_COVERAGE_TASKS.filter(task=>
                 !member.tasks.some(selected=>selected.kind===task.kind)).map(task=>
                   <button type="button" key={task.kind} onClick={()=>putTask(member.key,task)}>
                      ＋ {task.label}
                   </button>):null}
               {kind!=="article"?<button type="button"
                 onClick={()=>{setCustomFor(customFor===member.key?null:member.key);setCustomText("");}}>
                   ＋ Outra tarefa
               </button>:null}
               {kind!=="article"?<button type="button" className={"workflow-writer-choice"+(isWriter?" is-selected":"")}
                 aria-pressed={isWriter} onClick={()=>{setWriter(isWriter?"":member.profileId);setError("");}}>
                   {isWriter?"✓ ":""}Matéria
               </button>:null}
             </div>
           </div>
           {kind!=="article"&&member.tasks.length>0?<small className="workflow-help">Arraste para mudar a posição. Segure 3 segundos para editar ou excluir.</small>:null}
           {customFor===member.key?<div className="workflow-custom-add">
             <input value={customText} maxLength={80} placeholder="Nome da tarefa"
               onChange={e=>setCustomText(e.currentTarget.value)}/>
             <button type="button" onClick={()=>addCustom(member.key)}>Adicionar</button>
           </div>:null}
           {menu?.member===member.key?<div className="workflow-task-context">
             <strong>{menu.label}</strong>
             {editing?<div className="workflow-custom-add">
               <input maxLength={80} value={rename} onChange={e=>setRename(e.currentTarget.value)}/>
               <button type="button" onClick={()=>modifyTask("edit")}>Salvar</button>
             </div>:<div className="workflow-task-menu-actions">
               <button type="button" onClick={()=>setEditing(true)}>Editar</button>
               <button type="button" onClick={()=>modifyTask("delete")}>Excluir</button>
               <button type="button" onClick={()=>setMenu(null)}>Fechar</button>
             </div>}
           </div>:null}
           {isWriter?<div className="workflow-article-deadline">
             <strong>Prazo da matéria (opcional)</strong>
             <div className="workflow-schedule">
               <label className="agenda-field"><span>Data</span>
                 <span className="workflow-clearable">
                   <input type="date" name="article_due_date" value={dueDate} onChange={e=>setDueDate(e.currentTarget.value)}/>
                   {dueDate?<button type="button" aria-label="Limpar data da matéria" onClick={()=>{setDueDate("");setDueTime("");}}>×</button>:null}
                 </span>
               </label>
               <label className="agenda-field"><span>Hora</span>
                 <span className="workflow-clearable">
                   <input type="time" name="article_due_time" value={dueTime} onChange={e=>setDueTime(e.currentTarget.value)}/>
                   {dueTime?<button type="button" aria-label="Limpar hora da matéria" onClick={()=>setDueTime("")}>×</button>:null}
                 </span>
               </label>
             </div>
             <small>Sem data: sem prazo e sem aviso de atraso. Pode ser entregue quando for possível.</small>
           </div>:null}
         </section>;
       })}
       {kind!=="article"&&available&&crew.length<16?<button type="button"
         className="workflow-add-person" onClick={()=>{
           setCrew(prev=>[...prev,{key:nextKey.current++,profileId:available.id,attends:true,tasks:[]}]);
         }}>＋ Adicionar colaborador</button>:null}
     </div>
     <label className="agenda-field agenda-field-wide"><span>Observações (opcional)</span>
       <textarea name="description" rows={2} maxLength={4000}
         value={notes} onChange={e=>setNotes(e.currentTarget.value)}/>
     </label>
     {error?<p role="alert" className="workflow-error">{error}</p>:null}
     <div className="agenda-form-actions">
       <button type="submit" className="agenda-primary" disabled={isPending}>
         {isPending?"Salvando...":existing?"Aplicar funções neste compromisso":kind==="article"?"Criar pauta":"Salvar compromisso"}
       </button>
     </div>
   </div>:null}
 </form>;
}
