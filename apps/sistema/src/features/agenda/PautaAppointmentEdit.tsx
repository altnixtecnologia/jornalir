"use client";
import type {FormEvent} from "react";
import type {AgendaEventItem} from "./agendaTypes";
export function PautaAppointmentEdit({item,isPending,onSave}:{
 item:AgendaEventItem;isPending:boolean;onSave:(data:FormData)=>void;
}):JSX.Element{
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();onSave(new FormData(e.currentTarget));};
 return <details className="agenda-inline-edit">
   <summary>Editar meu compromisso</summary>
   <form className="agenda-form" onSubmit={submit}>
     <input type="hidden" name="updated_at" value={item.updatedAt}/>
     <label className="agenda-field agenda-field-wide"><span>Compromisso</span>
       <input name="title" required maxLength={180} defaultValue={item.title}/></label>
     <div className="agenda-datetime-row">
       <label className="agenda-field"><span>Data</span><input name="event_date" type="date" required defaultValue={item.eventDate}/></label>
       <label className="agenda-field"><span>Início</span><input name="start_time" type="time" required defaultValue={item.startTime??""}/></label>
       <label className="agenda-field"><span>Fim (opcional)</span><input name="end_time" type="time" defaultValue={item.endTime??""}/></label>
     </div>
     <label className="agenda-field"><span>Lembrete</span>
       <select name="reminder_minutes" defaultValue={item.reminderMinutes===null?"off":String(item.reminderMinutes)}>
         <option value="off">Sem lembrete</option><option value="0">No horário</option>
         <option value="5">5 min antes</option><option value="10">10 min antes</option>
         <option value="15">15 min antes</option><option value="30">30 min antes</option>
         <option value="60">1 hora antes</option><option value="120">2 horas antes</option>
         <option value="1440">1 dia antes</option>
       </select>
     </label>
     <label className="agenda-field agenda-field-wide"><span>Local</span><input name="location" maxLength={240} defaultValue={item.location??""}/></label>
     <label className="agenda-field agenda-field-wide"><span>Observações</span><textarea name="description" maxLength={4000} defaultValue={item.description??""}/></label>
     <p className="helper-text">As alterações são somente deste colaborador. O prazo da Pauta e os compromissos dos demais não serão modificados.</p>
     <div className="agenda-form-actions">
       <button type="submit" disabled={isPending} className="agenda-primary">Salvar compromisso</button>
     </div>
   </form>
 </details>;
}
