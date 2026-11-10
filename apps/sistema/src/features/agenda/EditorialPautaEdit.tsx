"use client";
import {useState,type FormEvent} from "react";
import type {AgendaProfile,WeeklyPautaItem} from "./agendaTypes";
import {WorkflowPeoplePicker} from "./WorkflowPeoplePicker";
export function EditorialPautaEdit({item,profiles,isPending,onSave,onCancel}:{item:WeeklyPautaItem;profiles:AgendaProfile[];isPending:boolean;onSave:(form:FormData)=>void;onCancel:()=>void;}):JSX.Element{
 const [selected,setSelected]=useState(item.assignees.map(p=>p.id)),[date,setDate]=useState(item.dueDate??""),[time,setTime]=useState(item.dueTime??""),[error,setError]=useState("");
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected.length){setError("Selecione pelo menos um responsável.");return;}const form=new FormData(e.currentTarget);form.set("workflow_profile_ids",JSON.stringify(selected));form.set("updated_at",item.updatedAt);onSave(form);};
 return <form className="workflow-article-edit" onSubmit={submit}>
  <h4>Editar matéria</h4>
  <label className="agenda-field"><span>Título</span><input name="title" required maxLength={180} defaultValue={item.title}/></label>
  <WorkflowPeoplePicker profiles={profiles} selected={selected} onChange={setSelected}/>
  <div className="workflow-article-deadline"><strong>Prazo da matéria (opcional)</strong>
   <div className="pauta-compact-datetime">
     <label>Data <input type="date" name="article_due_date" value={date} onChange={e=>{setDate(e.currentTarget.value);if(!e.currentTarget.value)setTime("");}}/></label>
     <label>Hora <input type="time" name="article_due_time" disabled={!date} value={time} onChange={e=>setTime(e.currentTarget.value)}/></label>
   </div>
   <small>Os compromissos individuais são editados na Agenda, não por este prazo.</small>
  </div>
  <label className="agenda-field"><span>Observações</span><textarea name="description" maxLength={4000} rows={2} defaultValue={item.description??""}/></label>
  {error?<span className="workflow-error" role="alert">{error}</span>:null}
  <div className="workflow-article-edit-actions"><button type="button" onClick={onCancel} disabled={isPending}>Cancelar</button><button type="submit" className="agenda-primary" disabled={isPending}>{isPending?"Salvando...":"Salvar alterações"}</button></div>
 </form>;
}
