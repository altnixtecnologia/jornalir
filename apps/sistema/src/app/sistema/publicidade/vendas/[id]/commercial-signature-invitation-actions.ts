"use server";
import {randomBytes} from "node:crypto";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "../../../../../lib/supabase/server";
import {checkModuleAction} from "../../../../../lib/permissions/checkModuleAction";
import {commercialTokenHash} from "../../../../../lib/signatures/commercialSignatures";
import {commercialCompanyGate} from "../../../../../lib/signatures/companyGate";
import {createSupabaseAdminClient} from "../../../../../lib/supabase/admin";
import {isWhatsappSignatureTemplateConfigured,sendWhatsappSignatureInviteTemplate} from "../../../../../lib/financeiro/whatsappCloudProvider";

type Result={error:string}|{ok:true;requestId:string;links:Array<{name:string;urlPath:string;deliveryError?:string}>};
type DeliveryOptions={sendWhatsapp?:boolean;operatorConfirmedOptIn?:boolean};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Convites privados gerados; envio Meta só após consentimento expresso do operador. Links aparecem uma vez. */
export async function createCommercialInvitationsAction(
 saleId:string,preparationId:string,confirmed:boolean,delivery?:DeliveryOptions,
):Promise<Result> {
 const denied=await checkModuleAction("publicidade","contratos_revisar");
 if(denied) return {error:denied};
 if(!confirmed) return {error:"Confirme que as pessoas e o PDF foram conferidos."};
 const sendWhatsapp=delivery?.sendWhatsapp===true;
 if(sendWhatsapp && !delivery?.operatorConfirmedOptIn)
  return {error:"Confirme que cada destinatário autorizou receber o convite via WhatsApp."};
 if(sendWhatsapp && !isWhatsappSignatureTemplateConfigured())
  return {error:"Template de assinatura não está configurado ou aprovado na Meta."};
 if(!UUID.test(saleId)||!UUID.test(preparationId)) return {error:"Identificadores inválidos."};
 try {
  const db=createSupabaseServerClient();
  const {data:pkg,error:pkgErr}=await db.from("commercial_contract_packages")
   .select("id,status").eq("commercial_sale_id",saleId).eq("status","legal_approved").maybeSingle();
  if(pkgErr||!pkg) throw new Error("Venda não aprovada para assinatura.");
  const {data:prep,error:prepErr}=await db.from("commercial_signature_preparations")
   .select("id,document_id,status").eq("id",preparationId).eq("status","draft").maybeSingle();
  if(prepErr||!prep) throw new Error("Lista de signatários não está vigente.");
  const {data:doc,error:docErr}=await db.from("commercial_contract_documents")
   .select("id").eq("id",prep.document_id).eq("package_id",pkg.id).maybeSingle();
  if(docErr||!doc) throw new Error("Documento não pertence à venda.");
  // Etapa 3A: o convite ao cliente só existe depois que a EMPRESA assinou o documento.
  const companyGateError=await commercialCompanyGate(doc.id);
  if(companyGateError) throw new Error(companyGateError);
  const {data:persons,error:personsErr}=await db.from("commercial_signature_participants")
   .select("id,signer_name,signer_email,signer_phone,signing_order,signer_role").eq("preparation_id",prep.id)
   .order("signing_order");
  if(personsErr||!persons||persons.length<2||persons.length>10) throw new Error("Lista de participantes inválida.");
  // A contratada assina em sistema (rodada da empresa); só quem é do cliente/testemunha recebe link.
  const external=persons.filter(person=>person.signer_role!=="contratada");
  if(external.length<1) throw new Error("Informe ao menos um signatário do cliente.");
  if(sendWhatsapp && external.some(p=>!p.signer_phone || !/^\d{10,13}$/.test(String(p.signer_phone))))
   throw new Error("Para enviar pela Meta, todos os signatários externos precisam ter telefone com DDD no cadastro.");
  const withTokens=external.map(person=>({...person,token:randomBytes(32).toString("hex")}));
  const {data:requestId,error:rpcErr}=await db.rpc("create_commercial_signature_request",{
   p_preparation_id:prep.id,
   p_invites:withTokens.map(p=>({participant_id:p.id,token_sha256:commercialTokenHash(p.token)})),
  });
  if(rpcErr||typeof requestId!=="string") throw new Error(rpcErr?.message??"Não foi possível iniciar a rodada.");
  const links=withTokens.map(person=>({
   name:person.signer_name,urlPath:"/assinar-contrato-comercial/"+person.token,
   deliveryError:undefined as string|undefined,
  }));
  if(sendWhatsapp){
   const admin=createSupabaseAdminClient();
   // A confirmação de opt-in é registrada sem armazenar o token do convite.
   const actor=await db.auth.getUser();
   await admin.from("audit_events").insert({
    user_id:actor.data.user?.id??null,entity_type:"commercial_signature_request",entity_id:requestId,
    action:"signature_whatsapp_invitation_optin_confirmed",
    metadata:{recipientCount:withTokens.length,template:"WHATSAPP_SIGNATURE_INVITE_TEMPLATE"},
   });
   const saved=await admin.from("commercial_signature_invitations")
    .select("id,participant_id").eq("request_id",requestId);
   if(saved.error || (saved.data??[]).length!==withTokens.length){
    links.forEach(link=>{link.deliveryError="Não foi possível conferir os destinatários; encaminhe o link individual manualmente.";});
   }else{
    const invitationByPerson=new Map((saved.data??[]).map(x=>[x.participant_id,x.id]));
    for(let index=0;index<withTokens.length;index+=1){
     const person=withTokens[index];
     const invitationId=invitationByPerson.get(person.id);
     if(!invitationId){links[index].deliveryError="Convite não localizado para envio.";continue;}
     try{
      const sent=await sendWhatsappSignatureInviteTemplate({
       toPhone:String(person.signer_phone),signerName:person.signer_name,
       contractNumber:"Documento comercial",
       invitationLink:"https://controle.altnix.com.br"+links[index].urlPath,
      });
      const written=await admin.from("commercial_signature_invitations").update({
       notification_channel:"whatsapp",notification_status:"accepted_by_meta",
       notification_message_id:sent.providerMessageId??null,
       notification_attempted_at:new Date().toISOString(),notification_error:null,
      }).eq("id",invitationId);
      if(written.error) throw new Error("Meta pode ter aceito a mensagem, mas não foi possível gravar a confirmação.");
     }catch{
      links[index].deliveryError="Envio não confirmado. Verifique a Meta antes de tentar novamente. O link individual continua disponível.";
      await admin.from("commercial_signature_invitations").update({
       notification_channel:"whatsapp",notification_status:"uncertain",
       notification_attempted_at:new Date().toISOString(),
       notification_error:"Envio não confirmado; reconciliação manual necessária.",
      }).eq("id",invitationId);
     }
    }
   }
  }
  revalidatePath("/sistema/publicidade/vendas/"+saleId);
  return {ok:true,requestId,links};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao criar convites."};}
}

/** Reenvio manual: o usuário recebe um link novo; o antigo perde a validade. */
export async function reissueCommercialInvitationAction(
 saleId:string,invitationId:string,reason:string,
):Promise<{error:string}|{ok:true;name:string;urlPath:string}> {
 const denied=await checkModuleAction("publicidade","contratos_revisar");
 if(denied) return {error:denied};
 if(!UUID.test(saleId)||!UUID.test(invitationId))
  return {error:"Identificadores inválidos."};
 if(reason.trim().length<20||reason.trim().length>1000)
  return {error:"Justifique a substituição do convite em 20 a 1000 caracteres."};
 try {
  const db=createSupabaseServerClient();
  const {data:pkg,error:pkgError}=await db.from("commercial_contract_packages")
   .select("id").eq("commercial_sale_id",saleId).eq("status","legal_approved").maybeSingle();
  if(pkgError||!pkg) throw new Error("Venda indisponível para assinatura.");
  const {data:invite,error:inviteError}=await db.from("commercial_signature_invitations")
   .select("id,request_id,status,commercial_signature_participants(signer_name),commercial_signature_requests(preparation_id,commercial_signature_preparations(document_id,commercial_contract_documents(package_id)))")
   .eq("id",invitationId).eq("status","pending").maybeSingle();
  if(inviteError||!invite) throw new Error("Convite não está pendente.");
  const relation=invite.commercial_signature_requests as unknown as {
   commercial_signature_preparations:{commercial_contract_documents:{package_id:string}};
  };
  if(relation.commercial_signature_preparations.commercial_contract_documents.package_id!==pkg.id)
   throw new Error("Convite não pertence à venda.");
  const token=randomBytes(32).toString("hex");
  const {error}=await db.rpc("reissue_commercial_signature_invitation",{
   p_invitation_id:invitationId,p_new_token_hash:commercialTokenHash(token),p_reason:reason.trim(),
  });
  if(error) throw new Error(error.message);
  revalidatePath("/sistema/publicidade/vendas/"+saleId);
  const person=invite.commercial_signature_participants as unknown as {signer_name:string};
  return {ok:true,name:person.signer_name,urlPath:"/assinar-contrato-comercial/"+token};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao reemitir link comercial."};}
}
