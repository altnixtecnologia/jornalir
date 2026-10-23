"use server";
import {randomBytes} from "node:crypto";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "../../../../../lib/supabase/server";
import {checkModuleAction} from "../../../../../lib/permissions/checkModuleAction";
import {commercialTokenHash} from "../../../../../lib/signatures/commercialSignatures";

type Result={error:string}|{ok:true;requestId:string;links:Array<{name:string;urlPath:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Convites privados gerados, NÃO enviados. Links aparecem uma única vez nesta resposta. */
export async function createCommercialInvitationsAction(
 saleId:string,preparationId:string,confirmed:boolean,
):Promise<Result> {
 const denied=await checkModuleAction("publicidade","contratos_revisar");
 if(denied) return {error:denied};
 if(!confirmed) return {error:"Confirme que as pessoas e o PDF foram conferidos."};
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
  const {data:persons,error:personsErr}=await db.from("commercial_signature_participants")
   .select("id,signer_name,signer_email,signing_order").eq("preparation_id",prep.id)
   .order("signing_order");
  if(personsErr||!persons||persons.length<2||persons.length>10) throw new Error("Lista de participantes inválida.");
  const withTokens=persons.map(person=>({...person,token:randomBytes(32).toString("hex")}));
  const {data:requestId,error:rpcErr}=await db.rpc("create_commercial_signature_request",{
   p_preparation_id:prep.id,
   p_invites:withTokens.map(p=>({participant_id:p.id,token_sha256:commercialTokenHash(p.token)})),
  });
  if(rpcErr||typeof requestId!=="string") throw new Error(rpcErr?.message??"Não foi possível iniciar a rodada.");
  revalidatePath("/sistema/publicidade/vendas/"+saleId);
  return {ok:true,requestId,links:withTokens.map(person=>({
   name:person.signer_name,urlPath:"/assinar-contrato-comercial/"+person.token,
  }))};
 }catch(e){return {error:e instanceof Error?e.message:"Falha ao criar convites."};}
}
