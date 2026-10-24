"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../../providers/supabase/auditEvents.supabase";
import {
  normalizeCommercialSigners, type CommercialSignerDraft,
} from "../../../../../lib/contracts/commercialSigners";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function prepareCommercialSignerListAction(
  saleId:string,
  documentId:string,
  signers:CommercialSignerDraft[],
):Promise<{ok:true;preparationId:string}|{error:string}> {
  const denied=await checkModuleAction("publicidade","contratos_revisar");
  if(denied) return {error:denied};
  if(!uuid.test(saleId)||!uuid.test(documentId)) {
    return {error:"Venda ou documento inválido."};
  }
  try {
    const normalized=normalizeCommercialSigners(signers);
    const supabase=createSupabaseServerClient();
    const actor=await getAuditContext(supabase);
    // Não aceitar IDs arbitrários: vínculo da venda e acesso por RLS.
    const {data:pkg,error:packageError}=await supabase
      .from("commercial_contract_packages").select("id,status")
      .eq("commercial_sale_id",saleId).eq("status","legal_approved").maybeSingle();
    if(packageError||!pkg) throw new Error("Contratação não está juridicamente aprovada.");
    const {data:document,error:documentError}=await supabase
      .from("commercial_contract_documents").select("id")
      .eq("package_id",pkg.id).eq("id",documentId).maybeSingle();
    if(documentError||!document) throw new Error("PDF comercial não pertence à venda informada.");
    const {data,error}=await supabase.rpc("prepare_commercial_signature_participants",{
      p_document_id:documentId,
      p_participants:normalized.map(s=>({
        role:s.role,name:s.name,email:s.email,phone:s.phone||"",
      })),
    });
    if(error || typeof data!=="string") {
      throw new Error(error?.message??"Falha ao preparar signatários.");
    }
    try {
      await recordAuditEventSupabase(supabase,{
        userId:actor.actorId,entityType:"commercial_signature_preparation",
        entityId:data,action:"prepare_signers",
        metadata:{saleId,documentId,participants:normalized.length},
      });
    } catch(error) {
      console.error("Falha de auditoria complementar na preparação comercial:",
        error instanceof Error?error.message:"unknown");
    }
    revalidatePath("/sistema/publicidade/vendas/"+saleId);
    return {ok:true,preparationId:data};
  } catch(error) {
    return {error:error instanceof Error?error.message:"Não foi possível preparar os signatários."};
  }
}
