import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "../../../../../../../../lib/supabase/server";
import {checkModuleAction} from "../../../../../../../../lib/permissions/checkModuleAction";
import {buildContractTemplatePdf} from "../../../../../../../../lib/contracts/contractTemplatePdf";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied=(status=404)=>NextResponse.json({error:"Minuta indisponível."},{
 status,headers:{"Cache-Control":"no-store"},
});
export async function GET(_request:Request,{params}:{
 params:{id:string;addendumId:string}
}):Promise<NextResponse>{
 if(!UUID.test(params.id)||!UUID.test(params.addendumId)) return denied(400);
 const [canPrepare,canReview]=await Promise.all([
  checkModuleAction("publicidade","contratos_preparar"),
  checkModuleAction("publicidade","contratos_revisar"),
 ]);
 if(canPrepare&&canReview) return denied(403);
 const db=createSupabaseServerClient();
 const {data:pkg}=await db.from("commercial_contract_packages")
  .select("id").eq("commercial_sale_id",params.id).maybeSingle();
 if(!pkg) return denied();
 const {data:addendum}=await db.from("commercial_contract_addenda")
  .select("id,title,reason,legal_text,addendum_number,approved_at,original_document_id")
  .eq("id",params.addendumId).eq("package_id",pkg.id).maybeSingle();
 if(!addendum) return denied();
 const legal=[
  "MINUTA DE CONFERENCIA - NAO ASSINAR",
  "Termo aditivo numero "+addendum.addendum_number,
  "Documento original: "+addendum.original_document_id,
  "Motivo declarado: "+addendum.reason,
  addendum.legal_text,
  "PREVIA SEM VALIDADE DE ASSINATURA - NAO UTILIZAR COMO DOCUMENTO DEFINITIVO",
 ].join("\n\n");
 try{
  const pdf=await buildContractTemplatePdf({
   title:"MINUTA - NAO ASSINAR - "+addendum.title,
   content:legal,contractReference:params.id,
   templateTitle:"Previa do aditivo para conferência",
   templateVersion:addendum.addendum_number,
   generatedAt:addendum.approved_at??new Date().toISOString(),
  });
  return new NextResponse(Buffer.from(pdf),{headers:{
   "Content-Type":"application/pdf",
   "Content-Disposition":'inline; filename="minuta-aditivo-nao-assinar.pdf"',
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"no-referrer",
  }});
 }catch{return denied(422);}
}
