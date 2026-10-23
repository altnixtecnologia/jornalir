import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {createSupabaseAdminClient} from "../../../../../lib/supabase/admin";
import {findCommercialInvitation,commercialInvitationPending} from "../../../../../lib/signatures/commercialSignatures";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(_req:Request,{params}:{params:{token:string}}):Promise<NextResponse>{
 const denied=()=>NextResponse.json({error:"Documento indisponível."},{status:404,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 const invite=await findCommercialInvitation(params.token);
 if(!invite||!commercialInvitationPending(invite)) return denied();
 const doc=invite.commercial_signature_requests.commercial_signature_preparations.commercial_contract_documents;
 if(!doc.file_reference.startsWith("commercial-contracts/"+doc.package_id+"/")) return denied();
 const admin=createSupabaseAdminClient();
 const {data,error}=await admin.storage.from("contract-documents").download(doc.file_reference);
 if(error||!data) return denied();
 const bytes=Buffer.from(await data.arrayBuffer());
 if(!bytes.subarray(0,5).equals(Buffer.from("%PDF-")) ||
  createHash("sha256").update(bytes).digest("hex")!==doc.sha256) return denied();
 return new NextResponse(bytes,{headers:{
  "Content-Type":"application/pdf",
  "Content-Disposition":'inline; filename="contrato-comercial-para-assinatura.pdf"',
  "Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"SAMEORIGIN",
  "Referrer-Policy":"no-referrer",
 }});
}
