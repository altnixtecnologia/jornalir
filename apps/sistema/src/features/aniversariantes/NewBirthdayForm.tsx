"use client";
import { useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEditorialBirthday } from "../../app/sistema/aniversariantes/actions";
import type { BirthdayGroup } from "./birthdayTypes";

export function NewBirthdayForm({groups,linkedId,onClose}:{
  groups:BirthdayGroup[];linkedId:string|null;onClose:()=>void;
}):JSX.Element{
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [name,setName]=useState("");
  const [birth,setBirth]=useState("");
  const [city,setCity]=useState("");
  const [relation,setRelation]=useState("");
  const [group,setGroup]=useState(linkedId||"");
  const [publication,setPublication]=useState(false);
  const [error,setError]=useState<string|null>(null);
  function submit():void{
    if(!name.trim()||!birth||pending)return;
    setError(null);
    startTransition(async()=>{
      const result=await saveEditorialBirthday({
        displayName:name.trim(),birthDate:birth,city:city.trim(),
        groupClientId:group||null,relationship:relation.trim(),
        profession:"",organization:"",knownAs:"",messageContext:"",notes:"",
        publishInPrint:publication,
      });
      if("error" in result){setError(result.error);return;}
      onClose();router.refresh();
    });
  }
  return <section className="form-section" style={{border:"1px solid var(--border,#ddd)",padding:14,borderRadius:9,marginBottom:16}}>
    <h2>Novo aniversariante — caso extraordinário</h2>
    <p className="helper-text">Inclua alguém que não possui cadastro de cliente. Se desejar, vincule à empresa, instituição ou pessoa cadastrada. Não será publicada automaticamente.</p>
    {error?<p role="alert" className="form-error">{error}</p>:null}
    <div className="cadastro-grid">
      <label className="cadastro-field cadastro-field--span-4"><span className="field-label">Nome</span>
        <input autoFocus maxLength={180} type="text" value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="cadastro-field cadastro-field--span-3"><span className="field-label">Data de nascimento</span>
        <input type="date" value={birth} onChange={e=>setBirth(e.target.value)}/></label>
      <label className="cadastro-field cadastro-field--span-5"><span className="field-label">Cidade</span>
        <input maxLength={120} type="text" value={city} onChange={e=>setCity(e.target.value)}/></label>
      <label className="cadastro-field cadastro-field--span-7"><span className="field-label">Vincular a (opcional)</span>
        <select value={group} onChange={e=>setGroup(e.target.value)}>
          <option value="">Registro independente</option>
          {groups.filter(g=>/^[a-f0-9-]{36}$/i.test(g.id)).map(g=>
            <option key={g.id} value={g.id}>{g.label} — {g.kind==="company"?"Empresa/instituição":"Pessoa"}</option>)}
        </select></label>
      <label className="cadastro-field cadastro-field--span-5"><span className="field-label">Relação / função</span>
        <input maxLength={100} type="text" value={relation} onChange={e=>setRelation(e.target.value)}/></label>
    </div>
    <button type="button" role="switch" aria-checked={publication} className={`switch-control${publication?" is-on":""}`}
      onClick={()=>setPublication(v=>!v)}>
      <span className="switch-track" aria-hidden="true"><span className="switch-thumb"/></span>
      <span>Autorizar para publicação no jornal</span>
    </button>
    <div style={{display:"flex",gap:8,marginTop:15}}>
      <button className="cadastros-btn-primary" type="button" disabled={pending||!name.trim()||!birth} onClick={submit}>
        {pending?"Salvando...":"Salvar aniversariante"}
      </button>
      <button className="cadastros-btn-secondary" type="button" disabled={pending} onClick={onClose}>Cancelar</button>
    </div>
  </section>;
}
