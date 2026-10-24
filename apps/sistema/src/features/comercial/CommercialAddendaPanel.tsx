"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {
 createCommercialAddendumAction,saveCommercialAddendumDraftAction,
 transitionCommercialAddendumAction,issueCommercialAddendumAction,
} from "../../app/sistema/publicidade/vendas/[id]/commercial-addendum-actions";

export interface CommercialAddendumView{
 id:string;original_document_id:string;addendum_number:number;
 title:string;reason:string;legal_text:string;
 status:"draft"|"pending_legal_review"|"legal_approved";
 last_return_note:string|null;
 commercial_contract_addendum_events?:Array<{
  id:string;event_type:string;note:string;created_at:string;
 }>;
}
interface OriginalView{id:string;title:string;}
const empty={title:"",reason:"",legalText:""};
export function CommercialAddendaPanel({saleId,originalDocuments,addenda,canPrepare,canReview,loadError}:{
 saleId:string;originalDocuments:OriginalView[];addenda:CommercialAddendumView[];
 canPrepare:boolean;canReview:boolean;loadError?:string;
}):JSX.Element|null{
 const router=useRouter(),[pending,startTransition]=useTransition();
 const [newOriginal,setNewOriginal]=useState(originalDocuments[0]?.id??"");
 const [newDraft,setNewDraft]=useState(empty);
 const [editing,setEditing]=useState<string|null>(null);
 const [draft,setDraft]=useState(empty);
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 if(!canPrepare&&!canReview) return null;
 function run(task:()=>Promise<{error:string}|{ok:true}>,
   confirmation:string,onSuccess?:()=>void):void{
  setError("");setNotice("");
  startTransition(async()=>{
   try{
    const result=await task();
    if("error" in result){setError(result.error);return;}
    onSuccess?.();
    setNotice(confirmation);router.refresh();
   }catch(err){setError(err instanceof Error?err.message:"Falha no aditivo.");}
  });
 }
 function updateNote(id:string,value:string):void{
  setNotes(v=>({...v,[id]:value}));
 }
 return <section className="form-section">
  <h2>Termos aditivos dos contratos comerciais</h2>
  <p className="helper-text">Um aditivo mantém o PDF original intacto e registra
   alterações em documento separado, vinculado ao original.
   Exige conferência jurídica expressa antes de emitir; depois será
   assinado no painel comercial de signatários, sem gerar uma nova cobrança.</p>
  {loadError?<p className="form-error" role="alert">{loadError}</p>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {notice?<p role="status" className="helper-text">{notice}</p>:null}
  {canPrepare && originalDocuments.length>0 ? <div className="inline-form">
   <h3>Novo aditivo</h3>
   <label className="form-field"><span className="field-label">Contrato original</span>
    <select disabled={pending} value={newOriginal}
      onChange={e=>setNewOriginal(e.target.value)}>
     {originalDocuments.map(doc=><option key={doc.id} value={doc.id}>{doc.title} · {doc.id.slice(0,8)}</option>)}
    </select>
   </label>
   <label className="form-field"><span className="field-label">Título</span>
    <input value={newDraft.title} maxLength={180} disabled={pending}
      onChange={e=>setNewDraft(d=>({...d,title:e.target.value}))}/>
   </label>
   <label className="form-field"><span className="field-label">Motivo da alteração</span>
    <textarea value={newDraft.reason} disabled={pending} maxLength={2000}
      onChange={e=>setNewDraft(d=>({...d,reason:e.target.value}))}/>
   </label>
   <label className="form-field"><span className="field-label">Texto jurídico completo do aditivo</span>
    <textarea rows={10} value={newDraft.legalText} disabled={pending} maxLength={30000}
      onChange={e=>setNewDraft(d=>({...d,legalText:e.target.value}))}/>
   </label>
   <p className="helper-text">Inclua qualificação completa de CONTRATANTE e CONTRATADA,
    referência ao contrato original, objeto da alteração, cláusulas
    e a identificação TERMO ADITIVO. Não há cláusulas inventadas pelo sistema.</p>
   <button type="button" disabled={pending||!newOriginal}
    onClick={()=>run(()=>createCommercialAddendumAction(
     saleId,newOriginal,newDraft.title,newDraft.reason,newDraft.legalText),
     "Rascunho criado, aguardando revisão de conteúdo.",
     ()=>setNewDraft(empty))}>Criar rascunho de aditivo</button>
  </div>:null}
  {addenda.map(item=><div key={item.id} className="inline-form">
   <h3>{item.title} · Aditivo nº {item.addendum_number}</h3>
   <p className="helper-text">
    {item.status==="draft"?"Rascunho":item.status==="pending_legal_review"?
     "Aguardando conferência jurídica":"Conferência jurídica aprovada"} ·
     contrato original {item.original_document_id.slice(0,8)}
   </p>
   {item.status==="draft" && item.last_return_note ? (
     <p role="status" className="helper-text">Devolvido para ajustes:
      {" "}{item.last_return_note}</p>
   ):null}
   {item.commercial_contract_addendum_events?.length ? (
     <details><summary>Histórico da revisão jurídica</summary>
      <ul>{item.commercial_contract_addendum_events.slice()
       .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
       .map(event=><li key={event.id}>{event.event_type}: {event.note}</li>)}</ul>
     </details>
   ):null}
   <p><a href={"/sistema/publicidade/vendas/"+saleId+"/aditivos/"+item.id+"/previa"}
     target="_blank" rel="noreferrer">Abrir prévia PDF — NÃO ASSINAR</a></p>
   {item.status==="draft" && canPrepare ? (
    editing===item.id ? <>
     <label className="form-field"><span className="field-label">Título</span>
      <input value={draft.title} maxLength={180} disabled={pending}
       onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/>
     </label>
     <label className="form-field"><span className="field-label">Motivo</span>
      <textarea value={draft.reason} disabled={pending} maxLength={2000}
       onChange={e=>setDraft(d=>({...d,reason:e.target.value}))}/>
     </label>
     <label className="form-field"><span className="field-label">Texto jurídico</span>
      <textarea rows={10} maxLength={30000} disabled={pending} value={draft.legalText}
       onChange={e=>setDraft(d=>({...d,legalText:e.target.value}))}/>
     </label>
     <button type="button" disabled={pending}
      onClick={()=>run(()=>saveCommercialAddendumDraftAction(
       saleId,item.id,draft.title,draft.reason,draft.legalText),
       "Rascunho atualizado.",()=>setEditing(null))}>Salvar alterações</button>
     <button type="button" disabled={pending} onClick={()=>setEditing(null)}>Cancelar</button>
    </> : <>
     <button type="button" disabled={pending}
      onClick={()=>{setEditing(item.id);setDraft({
       title:item.title,reason:item.reason,legalText:item.legal_text,
      });}}>Editar rascunho</button>
     <button type="button" disabled={pending} onClick={()=>run(
      ()=>transitionCommercialAddendumAction(saleId,item.id,"pending_legal_review"),
      "Aditivo encaminhado para revisão jurídica.",
     )}>Encaminhar à revisão</button>
    </>
   ):null}
   {item.status==="pending_legal_review" && canReview ? <>
    <details><summary>Conferir integralmente o texto jurídico do aditivo</summary>
     <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{item.legal_text}</pre>
    </details>
    <label className="form-field"><span className="field-label">Justificativa da revisão</span>
     <textarea maxLength={1000} disabled={pending} value={notes[item.id]??""}
      onChange={e=>updateNote(item.id,e.target.value)}/>
    </label>
    <div className="form-actions">
     <button type="button" disabled={pending||(notes[item.id]??"").trim().length<20}
      onClick={()=>run(()=>transitionCommercialAddendumAction(
       saleId,item.id,"legal_approved",notes[item.id]),
       "Aditivo aprovado juridicamente. PDF pode ser emitido.")}>
      Confirmar revisão jurídica
     </button>
     <button type="button" disabled={pending||(notes[item.id]??"").trim().length<20}
      onClick={()=>run(()=>transitionCommercialAddendumAction(
       saleId,item.id,"draft",notes[item.id]),"Aditivo devolvido para ajustes.")}>
      Devolver para ajustes
     </button>
    </div>
   </>:null}
   {item.status==="legal_approved" && canReview ? <>
    <p className="helper-text">A emissão mantém as cláusulas e a referência
     aprovadas. Uma emissão repetida reutiliza o PDF existente.</p>
    <button type="button" disabled={pending}
     onClick={()=>run(()=>issueCommercialAddendumAction(saleId,item.id),
      "PDF do aditivo emitido ou recuperado. Prepare os signatários na seção abaixo.")}>
     Emitir / verificar PDF do aditivo
    </button>
   </>:null}
  </div>)}
 </section>;
}
