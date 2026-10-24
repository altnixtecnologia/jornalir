"use client";

import { useEffect,useState } from "react";
import type { SiteAdMediaWithAsset } from "@ir/types";
import {
 publicationStatus,validateSiteAdPublication,type SiteAdPublicationInput
} from "./siteAdPublicationPolicy";

function brazilTodayISO():string{
 const parts=new Intl.DateTimeFormat("en-GB",{
  timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date());
 const value=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${value.year}-${value.month}-${value.day}`;
}
const LABELS={suspended:"Pausada manualmente",scheduled:"Agendada",
 expired:"Vigência encerrada",active:"Em exibição"} as const;

/** Pausa somente esta imagem no portal, sem relação automática com Pix/dívida. */
export function SiteAdPublicationRow({
 media,pending,onSave,
}:{
 media:SiteAdMediaWithAsset;
 pending:boolean;
 onSave:(changes:SiteAdPublicationInput)=>Promise<{error:string}|void>;
}):JSX.Element{
 const [active,setActive]=useState(media.active);
 const [from,setFrom]=useState(media.activeFrom??"");
 const [until,setUntil]=useState(media.activeUntil??"");
 const [saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState<string|null>(null);
 const [saved,setSaved]=useState(false);
 useEffect(()=>{
  setActive(media.active);setFrom(media.activeFrom??"");
  setUntil(media.activeUntil??"");
 },[media.active,media.activeFrom,media.activeUntil]);
 const state=publicationStatus({active:media.active,
  activeFrom:media.activeFrom,activeUntil:media.activeUntil},brazilTodayISO());
 async function save():Promise<void>{
  if(saving||pending)return;
  setSaved(false);setFeedback(null);
  let validated:ReturnType<typeof validateSiteAdPublication>;
  try{validated=validateSiteAdPublication({active,activeFrom:from||null,activeUntil:until||null});}
  catch(e){setFeedback(e instanceof Error?e.message:"Período inválido.");return;}
  setSaving(true);
  try{
   const result=await onSave({
    active:validated.active,activeFrom:validated.activeFrom??null,
    activeUntil:validated.activeUntil??null,
   });
   if(result && "error" in result){setFeedback(result.error);return;}
   setSaved(true);
  }catch{setFeedback("Falha de conexão. Verifique se o anúncio foi alterado antes de repetir.");}
  finally{setSaving(false);}
 }
 return <div className="site-ad-thumb-settings">
  <strong>Veiculação no site · {LABELS[state]}</strong>
  <label className="site-ad-thumb-custom-toggle">
   <input type="checkbox" checked={active} disabled={pending||saving}
    onChange={e=>{setActive(e.target.checked);setSaved(false);}} />
   Anúncio liberado para exibição
  </label>
  <div className="site-ad-thumb-settings-fields">
   <label className="form-field">
    <span className="field-label">Início (opcional)</span>
    <input type="date" value={from} disabled={pending||saving}
     onChange={e=>{setFrom(e.target.value);setSaved(false);}} />
   </label>
   <label className="form-field">
    <span className="field-label">Fim (opcional)</span>
    <input type="date" value={until} disabled={pending||saving}
     onChange={e=>{setUntil(e.target.value);setSaved(false);}} />
   </label>
  </div>
  <p className="helper-text">Pausa e datas valem somente para esta imagem neste site. Não suspendem mídias do Altnix Informativo nem alteram o Financeiro.</p>
  <button type="button" className="cadastros-btn-secondary"
   disabled={pending||saving} onClick={()=>void save()}>
   {saving?"Salvando…":saved?"Salvo ✓":"Salvar veiculação"}
  </button>
  {feedback?<p role="alert" className="form-error">{feedback}</p>:null}
 </div>;
}
