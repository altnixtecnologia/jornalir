"use client";
import type {AgendaProfile} from "./agendaTypes";
export function WorkflowPeoplePicker({profiles,selected,onChange}:{profiles:AgendaProfile[];selected:string[];onChange:(ids:string[])=>void;}):JSX.Element{
 const available=profiles.slice(0,16),selectedSet=new Set(selected);
 const toggle=(id:string)=>onChange(selectedSet.has(id)?selected.filter(p=>p!==id):[...selected,id].slice(0,16));
 const initials=(name:string)=>{const parts=name.trim().split(/\s+/).filter(Boolean);return (parts.length>1?parts[0][0]+parts[parts.length-1][0]:parts[0]?.slice(0,2)||"?").toLocaleUpperCase("pt-BR");};
 return <div className="workflow-people-picker" role="group" aria-label="Responsáveis pela matéria">
   <div className="workflow-people-picker-head"><strong>Responsáveis pela matéria</strong>
     <div className="workflow-people-picker-actions"><button type="button" onClick={()=>onChange(available.map(p=>p.id))}>Selecionar todos</button><button type="button" onClick={()=>onChange([])}>Limpar seleção</button></div>
   </div>
   <div className="workflow-people-grid">
    {available.map(profile=><button type="button" key={profile.id} className="workflow-people-choice"
      aria-pressed={selectedSet.has(profile.id)} onClick={()=>toggle(profile.id)}>
      <span className="workflow-people-avatar" aria-hidden="true">{initials(profile.name)}</span>
      <span className="workflow-people-name">{profile.name}</span>
      <span className="workflow-people-check" aria-hidden="true">{selectedSet.has(profile.id)?"✓":""}</span>
    </button>)}
   </div>
   <small className="workflow-people-summary">{selected.length} responsável(is) selecionado(s).{profiles.length>16?" Máximo permitido: 16 colaboradores.":""}</small>
 </div>;
}
