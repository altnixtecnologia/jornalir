import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {createSupabaseServerClient} from "../../../../../../../../lib/supabase/server";
import {checkModuleAction} from "../../../../../../../../lib/permissions/checkModuleAction";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied=(status=404)=>NextResponse.json({error:"Comprovante indisponível."},{
 status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"},
});
export async function GET(req:Request,{params}:{
 params:{id:string;requestId:string};
}):Promise<NextResponse> {
 if(!UUID.test(params.id)||!UUID.test(params.requestId)) return denied(400);
 const db=createSupabaseServerClient();
 const [noReview,finance]=await Promise.all([
  checkModuleAction("publicidade","contratos_revisar"),
  db.rpc("staff_can_see_module",{p_module:"financeiro"}),
 ]);
 if(noReview&&(finance.error||finance.data!==true)) return denied(403);
 const {data:packageRow}=await db.from("commercial_contract_packages")
  .select("id").eq("commercial_sale_id",params.id).maybeSingle();
 if(!packageRow) return denied();
 const {data:request}=await db.from("commercial_signature_requests")
  .select("id,preparation_id,status,final_file_reference,final_sha256,commercial_signature_preparations(document_id,commercial_contract_documents(package_id))")
  .eq("id",params.requestId).maybeSingle();
 const parent=request?.commercial_signature_preparations as unknown as {
  commercial_contract_documents:{package_id:string};
 }|undefined;
 if(!request||parent?.commercial_contract_documents.package_id!==packageRow.id) return denied();
 const url=new URL(req.url);
 const kind=url.searchParams.get("tipo");
 const inviteId=url.searchParams.get("convite");
 let path:string|null=null,sha:string|null=null;
 if(kind==="final"&&request.status==="completed"){
  path=request.final_file_reference;sha=request.final_sha256;
 }else if((kind==="comprovante"||kind==="assinado") && inviteId&&UUID.test(inviteId)){
  const {data:invite}=await db.from("commercial_signature_invitations")
   .select("id,request_id,status,receipt_path,receipt_sha256,signed_path,signed_sha256")
   .eq("id",inviteId).eq("request_id",request.id).eq("status","signed").maybeSingle();
  if(!invite) return denied();
  path=kind==="comprovante"?invite.receipt_path:invite.signed_path;
  sha=kind==="comprovante"?invite.receipt_sha256:invite.signed_sha256;
 }else return denied();
 if(!path||!sha||!path.startsWith("commercial-signatures/"+request.id+"/")
   ||!path.endsWith(".pdf")) return denied();
 const {data:file,error}=await db.storage.from("contract-documents").download(path);
 if(error||!file) return denied();
 const bytes=Buffer.from(await file.arrayBuffer());
 if(!bytes.subarray(0,5).equals(Buffer.from("%PDF-"))
   ||createHash("sha256").update(bytes).digest("hex")!==sha) return denied(409);
 return new NextResponse(bytes,{headers:{
  "Content-Type":"application/pdf",
  "Content-Disposition":'attachment; filename="evidencia-comercial-'+request.id+'.pdf"',
  "Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
 }});
}
