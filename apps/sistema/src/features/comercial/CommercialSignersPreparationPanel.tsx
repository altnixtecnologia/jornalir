"use client";

import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {
  prepareCommercialSignerListAction,
} from "../../app/sistema/publicidade/vendas/[id]/signature-preparation-actions";
import type {
  CommercialSignerDraft,CommercialSignerRole,
} from "../../lib/contracts/commercialSigners";

interface IssuedDocument {
  id:string;
  title:string;
}
export interface PreparedCommercialSigner {
  id:string;
  signer_role:string;
  signer_name:string;
  signer_email:string;
  signer_phone:string|null;
  signing_order:number;
}
export interface CommercialSignerPreparation {
  id:string;
  document_id:string;
  status:string;
  commercial_signature_participants:PreparedCommercialSigner[];
}
const defaultSigners:CommercialSignerDraft[]=[
  {role:"contratante",name:"",email:"",phone:""},
  {role:"contratada",name:"",email:"",phone:""},
];

export function CommercialSignersPreparationPanel({
  saleId,documents,preparations,canReview,loadError,
}:{
  saleId:string;
  documents:IssuedDocument[];
  preparations:CommercialSignerPreparation[];
  canReview:boolean;
  loadError?:string;
}):JSX.Element|null {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [current,setCurrent]=useState<string|null>(null);
  const [signers,setSigners]=useState<CommercialSignerDraft[]>(defaultSigners);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  if(!canReview || documents.length===0) return null;

  function edit(index:number,key:keyof CommercialSignerDraft,value:string):void {
    setSigners(rows=>rows.map((row,i)=>i===index
      ? {...row,[key]:value}:row));
  }
  function save(documentId:string):void {
    setError("");setNotice("");
    startTransition(async()=>{
      try {
        const result=await prepareCommercialSignerListAction(saleId,documentId,signers);
        if("error" in result) {setError(result.error);return;}
        setCurrent(null);
        setNotice("Signatários registrados para conferência. Nenhum convite foi enviado.");
        router.refresh();
      } catch(err) {
        setError(err instanceof Error?err.message:"Falha ao salvar signatários.");
      }
    });
  }
  return (
    <section className="form-section">
      <h2>Preparação dos signatários comerciais</h2>
      <p className="helper-text">
        Uma lista versionada para cada PDF emitido, com representantes da contratante,
        contratada e testemunhas opcionais. Esta etapa registra os nomes para
        conferência — não envia e-mails, WhatsApp, links, OTP ou solicita assinatura.
        Os contratos institucionais continuam no módulo próprio.
      </p>
      {loadError ? <p className="form-error" role="alert">{loadError}</p>:null}
      {error ? <p className="form-error" role="alert">{error}</p>:null}
      {notice ? <p className="helper-text" role="status">{notice}</p>:null}
      {documents.map(doc=>{
        const previous=preparations.find(prep=>prep.document_id===doc.id);
        const editing=current===doc.id;
        return (
          <div key={doc.id} className="inline-form">
            <strong>{doc.title}</strong>
            {previous && !editing ? (
              <>
                <p className="helper-text">
                  Lista registrada — {previous.commercial_signature_participants.length}
                  {" "}participante(s). Aguarda integração do assinador eletrônico comercial.
                </p>
                <ul className="helper-text">
                  {previous.commercial_signature_participants
                    .slice().sort((a,b)=>a.signing_order-b.signing_order)
                    .map(person=><li key={person.id}>
                      {person.signer_role}: {person.signer_name} · {person.signer_email}
                    </li>)}
                </ul>
                <button type="button" disabled={pending || Boolean(loadError)}
                  onClick={()=>{
                    const entries=previous.commercial_signature_participants.slice()
                      .sort((a,b)=>a.signing_order-b.signing_order)
                      .map(row=>({
                        role:row.signer_role as CommercialSignerRole,
                        name:row.signer_name,email:row.signer_email,
                        phone:row.signer_phone??"",
                      }));
                    setSigners(entries);setCurrent(doc.id);
                    setError("");setNotice("");
                  }}>
                  Corrigir participantes (preservar versão anterior)
                </button>
              </>
            ) : editing ? (
              <>
                {signers.map((signer,index)=>(
                  <div key={index} className="form-grid">
                    <label className="form-field">
                      <span className="field-label">Participação</span>
                      <select value={signer.role} disabled={pending}
                        onChange={e=>edit(index,"role",e.target.value as CommercialSignerRole)}>
                        <option value="contratante">Representante da contratante</option>
                        <option value="contratada">Representante da contratada</option>
                        <option value="testemunha">Testemunha</option>
                      </select>
                    </label>
                    <label className="form-field">
                      <span className="field-label">Nome completo</span>
                      <input value={signer.name} maxLength={180} disabled={pending}
                        onChange={e=>edit(index,"name",e.target.value)}/>
                    </label>
                    <label className="form-field">
                      <span className="field-label">E-mail</span>
                      <input type="email" value={signer.email} maxLength={254} disabled={pending}
                        onChange={e=>edit(index,"email",e.target.value)}/>
                    </label>
                    <label className="form-field">
                      <span className="field-label">WhatsApp (opcional; sem envio)</span>
                      <input value={signer.phone??""} maxLength={20} disabled={pending}
                        onChange={e=>edit(index,"phone",e.target.value)}/>
                    </label>
                    {index>=2 ? <button type="button" disabled={pending}
                      onClick={()=>setSigners(rows=>rows.filter((_,i)=>i!==index))}>
                      Remover participante
                    </button>:null}
                  </div>
                ))}
                <div className="form-actions">
                  <button type="button" disabled={pending||signers.length>=10}
                    onClick={()=>setSigners(rows=>[...rows,{role:"testemunha",name:"",email:"",phone:""}])}>
                    Adicionar testemunha
                  </button>
                  <button type="button" disabled={pending}
                    onClick={()=>save(doc.id)}>{previous ? "Salvar nova versão" : "Salvar lista para conferência"}</button>
                  <button type="button" disabled={pending}
                    onClick={()=>setCurrent(null)}>Cancelar</button>
                </div>
              </>
            ) : (
              <button type="button" disabled={pending||Boolean(loadError)}
                onClick={()=>{
                  setSigners(defaultSigners.map(s=>({...s})));setCurrent(doc.id);
                  setError("");setNotice("");
                }}>Preparar signatários deste PDF</button>
            )}
          </div>
        );
      })}
    </section>
  );
}
