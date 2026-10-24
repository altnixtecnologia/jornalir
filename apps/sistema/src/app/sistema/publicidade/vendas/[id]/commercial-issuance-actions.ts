"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import { compileCommercialDocuments } from "../../../../../lib/contracts/commercialIssuance";
import { buildContractTemplatePdf } from "../../../../../lib/contracts/contractTemplatePdf";
import { commercialDocumentId } from "../../../../../lib/contracts/commercialDocumentIdentity";
import { persistCommercialEvidence } from "../../../../../lib/signatures/commercialEvidenceStorage";

const BUCKET = "contract-documents";
const MAX_BYTES = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result<T = never> = { error: string } | ({ ok: true } & T);
function requireId(value:string):string {
  if (!uuid.test(value)) throw new Error("Identificador inválido.");
  return value;
}
function toError(error:unknown):string {
  return error instanceof Error ? error.message : "Falha ao processar documentos comerciais.";
}
function refresh(saleId:string):void {
  revalidatePath("/sistema/publicidade/vendas/"+saleId);
}

/** O revisor atesta expressamente a conferência jurídica, não a aplicação. */
export async function approveCommercialLegalReviewAction(
  packageId:string,saleId:string,confirmed:boolean,note:string,
):Promise<Result<{packageId:string}>> {
  const denied=await checkModuleAction("publicidade","contratos_revisar");
  if(denied) return {error:denied};
  if(confirmed!==true) return {error:"Confirme pessoalmente a conferência do conteúdo jurídico."};
  const reason=note.trim();
  if(reason.length<20 || reason.length>1000) {
    return {error:"Descreva a conferência jurídica (20 a 1000 caracteres)."};
  }
  try {
    const supabase=createSupabaseServerClient();
    const actor=await getAuditContext(supabase);
    const sale=requireId(saleId),pkg=requireId(packageId);
    // Compila TODOS os instrumentos antes de aceitar a transição. Não
    // confia no estado antigo da prévia nem nos valores enviados pela UI.
    await compileCommercialDocuments(supabase,sale,pkg,"pending_legal_review");
    const {data,error}=await supabase.from("commercial_contract_packages")
      .update({status:"legal_approved",approval_note:reason,updated_at:new Date().toISOString()})
      .eq("id",pkg).eq("commercial_sale_id",sale).eq("status","pending_legal_review")
      .select("id").maybeSingle();
    if(error || !data) throw new Error(error?.message ?? "A revisão mudou. Atualize a página.");
    try {
      await recordAuditEventSupabase(supabase,{
        userId:actor.actorId,entityType:"commercial_contract_package",entityId:pkg,
        action:"legal_approval",metadata:{saleId:sale,confirmed:true,reviewNote:reason},
      });
    } catch(error) {
      console.error("Auditoria complementar indisponível:",toError(error));
    }
    refresh(sale);
    return {ok:true,packageId:pkg};
  } catch(error) { return {error:toError(error)}; }
}

/**
 * Revisão foi aprovada, mas o modelo precisou de ajustes ANTES da primeira
 * emissão. O trigger nega retorno se existir qualquer documento emitido.
 * O evento de aprovação anterior permanece na auditoria do sistema.
 */
export async function reopenCommercialLegalReviewAction(
  packageId:string,saleId:string,reason:string,
):Promise<Result<{packageId:string}>> {
  const denied=await checkModuleAction("publicidade","contratos_revisar");
  if(denied) return {error:denied};
  const clean=reason.trim();
  if(clean.length<20 || clean.length>1000) {
    return {error:"Justifique a reabertura da conferência (20 a 1000 caracteres)."};
  }
  try {
    const supabase=createSupabaseServerClient();
    const actor=await getAuditContext(supabase);
    const sale=requireId(saleId),pkg=requireId(packageId);
    const {data,error}=await supabase.from("commercial_contract_packages")
      .update({status:"draft",approval_note:clean,updated_at:new Date().toISOString()})
      .eq("id",pkg).eq("commercial_sale_id",sale).eq("status","legal_approved")
      .select("id").maybeSingle();
    if(error||!data) throw new Error(error?.message??"Contratação emitida ou não reabrível.");
    try {
      await recordAuditEventSupabase(supabase,{
        userId:actor.actorId,entityType:"commercial_contract_package",entityId:pkg,
        action:"reopen_legal_review",metadata:{saleId:sale,reason:clean},
      });
    } catch(error) { console.error("Auditoria complementar indisponível:",toError(error)); }
    refresh(sale);
    return {ok:true,packageId:pkg};
  } catch(error) { return {error:toError(error)}; }
}

/**
 * Emite um PDF NOVO por documento aprovado. Reexecutável: ignora os já
 * registrados com a mesma versão, não substitui nem remove evidências.
 * Não emite cobranças, convites ou assinaturas.
 */
export async function issueCommercialContractDocumentsAction(
  packageId:string,saleId:string,
):Promise<Result<{packageId:string;issued:number;existing:number}>> {
  const denied=await checkModuleAction("publicidade","contratos_revisar");
  if(denied) return {error:denied};
  let issued=0;
  try {
    const supabase=createSupabaseServerClient();
    const actor=await getAuditContext(supabase);
    const sale=requireId(saleId),pkg=requireId(packageId);
    const documents=await compileCommercialDocuments(supabase,sale,pkg,"legal_approved");
    const {data:stored,error:storedError}=await supabase
      .from("commercial_contract_documents")
      .select("id,service_id,template_id,template_version,sha256,file_reference").eq("package_id",pkg).is("addendum_id",null);
    if(storedError) throw new Error("Não foi possível conferir emissões anteriores: "+storedError.message);
    let existing=0;
    for(const doc of documents) {
      const prior=(stored??[]).find(row=>row.service_id===doc.serviceId);
      if(prior) {
        if(prior.template_id!==doc.templateId || prior.template_version!==doc.templateVersion) {
          throw new Error("Há documento anterior com outra versão. Revise o histórico antes de prosseguir.");
        }
        await persistCommercialEvidence(supabase,{
          bucket:BUCKET,path:prior.file_reference,format:"application/pdf",
          expectedSha256:prior.sha256,
        });
        existing++;
        continue;
      }
      const id=commercialDocumentId(pkg,doc.serviceId);
      const path="commercial-contracts/"+pkg+"/"+id+".pdf";
      const pdf=await buildContractTemplatePdf({
        title:doc.templateTitle,content:doc.text,contractReference:sale,
        templateTitle:doc.templateTitle,templateVersion:doc.templateVersion,
        generatedAt:new Date().toISOString(),
      });
      if(pdf.byteLength===0 || pdf.byteLength>MAX_BYTES) {
        throw new Error("PDF inválido ou acima de 4 MB: "+doc.templateTitle);
      }
      // O mesmo serviço da mesma contratação recebe sempre o mesmo UUID.
      // Se o PDF foi salvo e o INSERT falhou, o Storage contém o documento
      // anterior. Recuperar seus bytes, NUNCA substituir silenciosamente.
      const storedFile=await persistCommercialEvidence(supabase,{
        bucket:BUCKET,path,format:"application/pdf",candidate:pdf,
      });
      const sha256=storedFile.sha256;
      if(storedFile.bytes.length>MAX_BYTES)
        throw new Error("PDF privado anteriormente salvo ultrapassa 4 MB.");
      const {error:insertError}=await supabase.from("commercial_contract_documents").insert({
        id,package_id:pkg,service_id:doc.serviceId,template_id:doc.templateId,
        template_version:doc.templateVersion,file_reference:path,sha256,
        size_bytes:storedFile.bytes.length,title:doc.templateTitle,issued_by:actor.actorId,
      });
      if(insertError) {
        // Concorrência: outra requisição pode ter registrado o mesmo PDF.
        // Aceitar somente o documento equivalente, nunca reatribuir
        // template/versão ou sobrescrever bytes.
        const {data:concurrent}=await supabase.from("commercial_contract_documents")
          .select("id,service_id,template_id,template_version,sha256,file_reference")
          .eq("id",id).maybeSingle();
        if(concurrent && concurrent.service_id===doc.serviceId
          && concurrent.template_id===doc.templateId
          && concurrent.template_version===doc.templateVersion
          && concurrent.sha256===sha256
          && concurrent.file_reference===path){
          existing++;
          continue;
        }
        throw new Error("PDF privado salvo mas não registrado; a recuperação exige conferência: "+insertError.message);
      }
      issued++;
      try {
        await recordAuditEventSupabase(supabase,{
          userId:actor.actorId,entityType:"commercial_contract_document",entityId:id,
          action:"issue_pdf",metadata:{saleId:sale,packageId:pkg,templateId:doc.templateId,recovered:storedFile.reused},
        });
      } catch(error) { console.error("Auditoria complementar indisponível:",toError(error)); }
    }
    refresh(sale);
    return {ok:true,packageId:pkg,issued,existing};
  } catch(error) {
    if(issued) refresh(saleId);
    return {error:toError(error)};
  }
}
