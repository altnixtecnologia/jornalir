"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {createCommercialInvitationsAction,reissueCommercialInvitationAction} from "../../app/sistema/publicidade/vendas/[id]/commercial-signature-invitation-actions";

export interface CommercialRequestView {
 id:string;preparation_id:string;status:string;completed_at:string|null;
 commercial_signature_invitations:Array<{
  id:string;participant_id:string;status:string;expires_at:string;signed_at:string|null;
  commercial_signature_participants:{signer_name:string;signer_role:string;signer_email:string};
 }>;
}
export function CommercialSignatureRequestsPanel({saleId,preparations,requests,canReview}:{
 saleId:string;preparations:Array<{id:string;document_id:string;status:string}>;
 requests:CommercialRequestView[];canReview:boolean;
}):JSX.Element|null {
 const router=useRouter(),[pending,startTransition]=useTransition();
 const [error,setError]=useState("");
 const [reissueId,setReissueId]=useState<string|null>(null);
 const [reason,setReason]=useState("");
 const [confirmed,setConfirmed]=useState<string|null>(null);
 const [links,setLinks]=useState<Array<{name:string;urlPath:string}>>([]);
 if(!canReview||preparations.length===0) return null;
 function reissue(invitationId:string):void{
  setError("");setLinks([]);
  startTransition(async()=>{
   const result=await reissueCommercialInvitationAction(saleId,invitationId,reason);
   if("error" in result){setError(result.error);return;}
   setReissueId(null);setReason("");
   setLinks([{name:result.name,urlPath:result.urlPath}]);
   router.refresh();
  });
 }
 function begin(id:string):void{
  setError("");setLinks([]);
  startTransition(async()=>{
   const result=await createCommercialInvitationsAction(saleId,id,confirmed===id);
   if("error" in result){setError(result.error);return;}
   setConfirmed(null);setLinks(result.links);
   router.refresh();
  });
 }
 return <section className="form-section">
  <h2>Assinaturas comerciais</h2>
  <p className="helper-text">Uma rodada por versão da lista. Links individuais aparecem
   uma única vez após a criação. Copie os links e encaminhe somente aos destinatários
   conferidos. Não há envio automático de e-mail ou WhatsApp.</p>
  {error ? <p className="form-error" role="alert">{error}</p>:null}
  {links.length>0 ? <div className="form-section" role="status">
   <strong>Links gerados — copie antes de sair da página</strong>
   {links.map(link=><div key={link.urlPath} className="form-actions">
    <span>{link.name}</span>
    <button type="button" onClick={()=>void navigator.clipboard.writeText(
     window.location.origin+link.urlPath)}>Copiar link individual</button>
   </div>)}
   <p className="helper-text">A URL contém um token secreto. Não publique em grupos ou redes sociais.</p>
  </div>:null}
  {preparations.map(prep=>{
   const request=requests.find(row=>row.preparation_id===prep.id);
   return <div key={prep.id} className="form-section">
    <p className="helper-text">Documento: {prep.document_id}</p>
    {request ? <>
     <strong>{request.status==="completed"?"Todos assinaram":
      request.status==="pending"?"Assinaturas pendentes":"Rodada cancelada"}</strong>
     <ul className="helper-text">{request.commercial_signature_invitations.map(inv=>
      <li key={inv.id}>
       {inv.commercial_signature_participants.signer_role}:
       {" "}{inv.commercial_signature_participants.signer_name}
       {" "}— {inv.status==="signed"?"Assinado":inv.status==="revoked"?"Revogado":
       Date.parse(inv.expires_at)<=Date.now()?"Expirado":"Aguardando assinatura"}
       {inv.status==="pending" ? (
        reissueId===inv.id ? <div className="form-field">
         <label>Justificativa da substituição do link
          <textarea value={reason} maxLength={1000} disabled={pending}
           onChange={e=>setReason(e.target.value)}/>
         </label>
         <button type="button" disabled={pending||reason.trim().length<20}
          onClick={()=>reissue(inv.id)}>Revogar anterior e criar novo link</button>
         <button type="button" disabled={pending} onClick={()=>setReissueId(null)}>Cancelar</button>
        </div> :
        <button type="button" disabled={pending}
         onClick={()=>{setReissueId(inv.id);setReason("");}}>
         Substituir link (revoga o anterior)
        </button>
       ):null}
      </li>)}</ul>
    </> : <>
     <label className="form-field">
      <input type="checkbox" checked={confirmed===prep.id} disabled={pending}
       onChange={e=>setConfirmed(e.target.checked?prep.id:null)}/>
      {" "}Confirmei o PDF e os representantes antes de gerar os convites.
     </label>
     <button type="button" disabled={pending||confirmed!==prep.id}
      onClick={()=>begin(prep.id)}>Criar convites individuais (sem envio)</button>
    </>}
   </div>;
  })}
 </section>;
}
