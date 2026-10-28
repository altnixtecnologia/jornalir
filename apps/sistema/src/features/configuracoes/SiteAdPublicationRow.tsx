"use client";

import {useEffect,useState} from "react";
import type {SiteAdMediaWithAsset} from "@ir/types";
import {publicationStatus,validateSiteAdPublication,type SiteAdPublicationInput}
 from "./siteAdPublicationPolicy";
import {notify} from "../../lib/feedback/notify";

/** Imagem de cortesia: visível quando liberada MANUALMENTE, sem data nem fatura. */
export function SiteAdPublicationRow({media,pending,onSave}:{
 media:SiteAdMediaWithAsset;
 pending:boolean;
 onSave:(changes:SiteAdPublicationInput)=>Promise<{error:string}|void>;
}):JSX.Element{
 const [active,setActive]=useState(media.active);
 const [saving,setSaving]=useState(false);
 const [saved,setSaved]=useState(false);
 useEffect(()=>setActive(media.active),[media.active]);
 async function save():Promise<void>{
  if(saving||pending)return;
  setSaved(false);
  let changes:SiteAdPublicationInput;
  try{changes=validateSiteAdPublication({active});}
  catch(e){notify.error("Situação inválida",e instanceof Error?e.message:"Situação inválida.");return;}
  setSaving(true);
  try{
   const result=await onSave(changes);
   if(result&&"error" in result){notify.error("Não foi possível salvar",result.error);return;}
   setSaved(true);
  }catch{notify.error("Não foi possível salvar","Falha de conexão. Confira a alteração antes de repetir.");}
  finally{setSaving(false);}
 }
 return <div className="site-ad-thumb-settings">
  <strong>Patrocinador bônus · {publicationStatus({active:media.active})==="active"?"Exibindo":"Pausado"}</strong>
  <label className="site-ad-thumb-custom-toggle">
   <input type="checkbox" checked={active} disabled={pending||saving}
    onChange={e=>{setActive(e.target.checked);setSaved(false);}} />
   Exibir este patrocinador no portal
  </label>
  <p className="helper-text">Gratuito, selecionado manualmente. Sem vínculo com clientes, cobranças, datas automáticas ou mídias do Altnix Informativo.</p>
  <button type="button" className="cadastros-btn-secondary"
   disabled={pending||saving} onClick={()=>void save()}>
   {saving?"Salvando…":saved?"Salvo ✓":"Salvar exibição"}
  </button>
 </div>;
}
