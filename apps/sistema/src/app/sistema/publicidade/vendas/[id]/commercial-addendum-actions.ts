"use server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "../../../../../lib/supabase/server";
import {checkModuleAction} from "../../../../../lib/permissions/checkModuleAction";
import {getAuditContext} from "../../../../../lib/auth/getAuditContext";
import {recordAuditEventSupabase} from "../../../../../providers/supabase/auditEvents.supabase";
import {buildContractTemplatePdf} from "../../../../../lib/contracts/contractTemplatePdf";
import {commercialAddendumDocumentId} from "../../../../../lib/contracts/commercialDocumentIdentity";
import {persistCommercialEvidence} from "../../../../../lib/signatures/commercialEvidenceStorage";

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Result<T=never>={error:string}|({ok:true}&T);
function validId(id:string):boolean{return UUID.test(id);}
function problem(error:unknown):string{return error instanceof Error?error.message:"Falha ao processar aditivo comercial.";}
function refresh(saleId:string):void{revalidatePath("/sistema/publicidade/vendas/"+saleId);}
function validateText(title:string,reason:string,body:string):void{
 if(title.trim().length<5||title.trim().length>180) throw new Error("Título do aditivo deve ter 5 a 180 caracteres.");
 if(reason.trim().length<20||reason.trim().length>2000) throw new Error("Descreva o motivo do aditivo em 20 a 2000 caracteres.");
 if(body.trim().length<20||body.trim().length>30000) throw new Error("Informe o texto jurídico completo do aditivo.");
}
async function salePackage(saleId:string){
 const supabase=createSupabaseServerClient();
 const {data,error}=await supabase.from("commercial_contract_packages")
  .select("id,status").eq("commercial_sale_id",saleId)
  .eq("status","legal_approved").maybeSingle();
 if(error||!data) throw new Error("Venda sem pacote comercial juridicamente aprovado.");
 return {supabase,pkg:data};
}
export async function createCommercialAddendumAction(
 saleId:string,originalDocumentId:string,title:string,reason:string,legalText:string,
):Promise<Result<{addendumId:string}>>{
 const denied=await checkModuleAction("publicidade","contratos_preparar");
 if(denied) return {error:denied};
 if(!validId(saleId)||!validId(originalDocumentId)) return {error:"Venda ou contrato original inválido."};
 try{
  validateText(title,reason,legalText);
  const {supabase,pkg}=await salePackage(saleId);
  const actor=await getAuditContext(supabase);
  const {data:original,error:originalError}=await supabase
   .from("commercial_contract_documents").select("id")
   .eq("id",originalDocumentId).eq("package_id",pkg.id)
   .is("addendum_id",null).maybeSingle();
  if(originalError||!original) throw new Error("Documento original não encontrado.");
  const {data,error}=await supabase.from("commercial_contract_addenda").insert({
   package_id:pkg.id,original_document_id:original.id,
   addendum_number:1,title:title.trim(),reason:reason.trim(),legal_text:legalText.trim(),
   status:"draft",created_by:actor.actorId,
  }).select("id").single();
  if(error||!data) throw new Error(error?.message??"Falha ao criar rascunho de aditivo.");
  refresh(saleId);
  return {ok:true,addendumId:data.id};
 }catch(error){return {error:problem(error)};}
}
export async function saveCommercialAddendumDraftAction(
 saleId:string,addendumId:string,title:string,reason:string,legalText:string,
):Promise<Result<{addendumId:string}>>{
 const denied=await checkModuleAction("publicidade","contratos_preparar");
 if(denied) return {error:denied};
 if(!validId(saleId)||!validId(addendumId)) return {error:"Identificador inválido."};
 try{
  validateText(title,reason,legalText);
  const {supabase,pkg}=await salePackage(saleId);
  const {data,error}=await supabase.from("commercial_contract_addenda")
   .update({title:title.trim(),reason:reason.trim(),legal_text:legalText.trim()})
   .eq("id",addendumId).eq("package_id",pkg.id).eq("status","draft")
   .select("id").maybeSingle();
  if(error||!data) throw new Error(error?.message??"Aditivo não está em rascunho.");
  refresh(saleId);
  return {ok:true,addendumId:data.id};
 }catch(error){return {error:problem(error)};}
}
export async function transitionCommercialAddendumAction(
 saleId:string,addendumId:string,
 to:"pending_legal_review"|"legal_approved"|"draft",
 note:string="",
):Promise<Result<{addendumId:string}>>{
 const action=to==="pending_legal_review"?"contratos_preparar":"contratos_revisar";
 const denied=await checkModuleAction("publicidade",action);
 if(denied) return {error:denied};
 if(!validId(saleId)||!validId(addendumId)) return {error:"Identificador inválido."};
 if(to!=="pending_legal_review"&&(note.trim().length<20||note.trim().length>1000))
  return {error:"Informe justificativa de 20 a 1000 caracteres."};
 const from=to==="pending_legal_review"?"draft":"pending_legal_review";
 try{
  const {supabase,pkg}=await salePackage(saleId);
  const changes:Record<string,string>={status:to};
  if(to==="legal_approved") changes.approval_note=note.trim();
  if(to==="draft") changes.last_return_note=note.trim();
  const {data,error}=await supabase.from("commercial_contract_addenda")
   .update(changes).eq("id",addendumId).eq("package_id",pkg.id)
   .eq("status",from).select("id").maybeSingle();
  if(error||!data) throw new Error(error?.message??"Aditivo foi alterado em outra sessão ou exige revisão.");
  refresh(saleId);
  return {ok:true,addendumId:data.id};
 }catch(error){return {error:problem(error)};}
}
/**
 * PDF do aditivo aprovado é autônomo, imutável e privado; o contrato
 * original não é alterado. A lista de signatários utiliza o MESMO fluxo
 * comercial separado, por document_id do novo PDF.
 */
export async function issueCommercialAddendumAction(
 saleId:string,addendumId:string,
):Promise<Result<{documentId:string;reused:boolean}>>{
 const denied=await checkModuleAction("publicidade","contratos_revisar");
 if(denied) return {error:denied};
 if(!validId(saleId)||!validId(addendumId)) return {error:"Identificador inválido."};
 try{
  const {supabase,pkg}=await salePackage(saleId);
  const actor=await getAuditContext(supabase);
  const {data:addendum,error:addendumError}=await supabase
   .from("commercial_contract_addenda")
   .select("id,package_id,original_document_id,addendum_number,title,reason,legal_text,status,approved_at")
   .eq("id",addendumId).eq("package_id",pkg.id)
   .eq("status","legal_approved").maybeSingle();
  if(addendumError||!addendum) throw new Error("Aditivo não aprovado juridicamente.");
  const {data:original,error:originalError}=await supabase
   .from("commercial_contract_documents")
   .select("id,service_id,template_id,template_version,sha256,addendum_id")
   .eq("id",addendum.original_document_id).eq("package_id",pkg.id)
   .is("addendum_id",null).maybeSingle();
  if(originalError||!original) throw new Error("Contrato original do aditivo indisponível.");
  const id=commercialAddendumDocumentId(addendum.id);
  const path="commercial-contracts/"+pkg.id+"/"+id+".pdf";
  const {data:existing,error:existingError}=await supabase
   .from("commercial_contract_documents")
   .select("id,addendum_id,sha256,file_reference")
   .eq("addendum_id",addendum.id).maybeSingle();
  if(existingError) throw new Error(existingError.message);
  if(existing){
   if(existing.id!==id || existing.file_reference!==path)
    throw new Error("Documento do aditivo foi emitido com outro identificador. Requer conferência.");
   await persistCommercialEvidence(supabase,{
    bucket:"contract-documents",path,format:"application/pdf",
    expectedSha256:existing.sha256,
   });
   return {ok:true,documentId:id,reused:true};
  }
  const content=[
   "TERMO ADITIVO Nº "+addendum.addendum_number,
   "Documento original: "+original.id,
   "SHA-256 do contrato original: "+original.sha256,
   "Motivo declarado: "+addendum.reason,
   addendum.legal_text,
  ].join("\n\n");
  const pdf=await buildContractTemplatePdf({
   title:addendum.title,content,contractReference:saleId,
   templateTitle:"Termo aditivo conferido juridicamente",
   templateVersion:addendum.addendum_number,
   generatedAt:addendum.approved_at??new Date().toISOString(),
  });
  if(pdf.byteLength===0||pdf.byteLength>4*1024*1024)
   throw new Error("PDF do aditivo ultrapassa o limite de 4 MB.");
  const saved=await persistCommercialEvidence(supabase,{
   bucket:"contract-documents",path,format:"application/pdf",candidate:pdf,
  });
  if(saved.bytes.length>4*1024*1024)
   throw new Error("PDF privado do aditivo excede 4 MB.");
  const {error:insertError}=await supabase.from("commercial_contract_documents").insert({
   id,package_id:pkg.id,service_id:original.service_id,
   template_id:original.template_id,template_version:original.template_version,
   file_reference:path,sha256:saved.sha256,size_bytes:saved.bytes.length,
   title:addendum.title,issued_by:actor.actorId,addendum_id:addendum.id,
  });
  if(insertError){
   const {data:concurrent}=await supabase.from("commercial_contract_documents")
    .select("id,sha256,addendum_id").eq("addendum_id",addendum.id).maybeSingle();
   if(!concurrent||concurrent.id!==id||concurrent.sha256!==saved.sha256)
    throw new Error("PDF salvo sem registro consistente; conciliação obrigatória: "+insertError.message);
  }
  try{
   await recordAuditEventSupabase(supabase,{
    userId:actor.actorId,entityType:"commercial_contract_addendum",
    entityId:addendum.id,action:"issue_addendum",
    metadata:{saleId,documentId:id,originalDocumentId:original.id,recovered:saved.reused},
   });
  }catch(error){console.error("Auditoria complementar de aditivo:",problem(error));}
  refresh(saleId);
  return {ok:true,documentId:id,reused:saved.reused};
 }catch(error){return {error:problem(error)};}
}
