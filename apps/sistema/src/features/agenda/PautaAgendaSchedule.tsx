"use client";
import {useState,type FormEvent} from "react";
import type {WeeklyPautaItem} from "./agendaTypes";
import {WorkflowPeoplePicker} from "./WorkflowPeoplePicker";
export function PautaAgendaSchedule({item,isPending,onSave,onCancel}:{
 item:WeeklyPautaItem;isPending:boolean;onSave:(data:FormData)=>void;onCancel:()=>void;
}):JSX.Element{
 const eligible=item.assignees.filter(person=>!item.appointments.some(a=>a.profileId===person.id));
 const [selected,setSelected]=useState<string[]>(eligible.map(p=>p.id));
 const [date,setDate]=useState("");
 const [time,setTime]=useState("");
 const [error,setError]=useState("");
 const submit=(e:FormEvent<HTMLFormElement>)=>{
   e.preventDefault();
   if(!selected.length||!date||!time){setError("Selecione responsáveis, data e horário.");return;}
   const form=new FormData(e.currentTarget);
   form.set("appointment_profile_ids",JSON.stringify(selected));
   onSave(form);
 };
 return <form className="workflow-article-edit pauta-appointment-scheduler" onSubmit={submit}>
   <strong>Agendar compromisso individual na Agenda</strong>
   <p className="helper-text">Cada colaborador terá seu próprio compromisso e poderá alterar seu horário independentemente na Agenda. O prazo da matéria não será alterado.</p>
   <WorkflowPeoplePicker profiles={eligible} selected={selected} onChange={setSelected}/>
   <div className="pauta-compact-datetime">
     <label>Data <input name="appointment_date" type="date" value={date} onChange={e=>setDate(e.currentTarget.value)} required/></label>
     <label>Horário <input name="appointment_time" type="time" value={time} onChange={e=>setTime(e.currentTarget.value)} required/></label>
   </div>
   <p className="helper-text">Lembrete padrão: 30 minutos antes. Pode ser editado na Agenda.</p>
   {error?<p className="workflow-error" role="alert">{error}</p>:null}
   <div className="workflow-article-edit-actions">
     <button type="button" disabled={isPending} onClick={onCancel}>Cancelar</button>
     <button type="submit" disabled={isPending} className="agenda-primary">Criar compromissos</button>
   </div>
 </form>;
}
