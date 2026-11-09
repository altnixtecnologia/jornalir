import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {createSupabaseAdminClient} from "../../../../../lib/supabase/admin";
import {createSupabaseServerClient} from "../../../../../lib/supabase/server";
import {canReadCommercialInvitationPdf} from "../../../../../lib/signatures/commercialDocumentAccess";
import {findCommercialInvitation,commercialInvitationPending} from "../../../../../lib/signatures/commercialSignatures";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(_req:Request, props:{params: Promise<{token:string}>}):Promise<NextResponse> {
 const params = await props.params;
 const denied=()=>NextResponse.json({error:"Documento indisponível."},{status:404,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 const invite=await findCommercialInvitation(params.token);
 if(!invite||!commercialInvitationPending(invite)) return denied();
 // URL de convite NÃO concede acesso direto ao conteúdo privado.
 // O destinatário precisa ter confirmado o OTP e possuir a sessão
 // autenticada do mesmo e-mail/UUID registrado nesta ligação.
 const client=createSupabaseServerClient();
 const {data:user,error:authError}=await client.auth.getUser();
 if(authError || !canReadCommercialInvitationPdf({
   invitationPending:commercialInvitationPending(invite),
   verifiedUserId:invite.verified_user_id,
   verifiedAt:invite.verified_at,
   invitedEmail:invite.commercial_signature_participants.signer_email,
   sessionUserId:user.user?.id??null,
   sessionEmail:user.user?.email??null,
 })) return denied();
 const doc=invite.commercial_signature_requests.commercial_signature_preparations.commercial_contract_documents;
 if(!doc.file_reference.startsWith("commercial-contracts/"+doc.package_id+"/")) return denied();
 const admin=createSupabaseAdminClient();
 const documentId=invite.commercial_signature_requests.commercial_signature_preparations.document_id;
 // Cliente só pode conferir o PDF já assinado pela empresa. Em assinaturas
 // sucessivas, mostrar a versão cumulativa anterior, tal como o claim SQL
 // usa na assinatura efetiva. NUNCA usar o PDF original da venda aqui.
 const {data:round,error:roundError}=await admin.from("contract_company_signature_rounds")
  .select("id,final_path,final_sha256").eq("commercial_document_id",documentId)
  .eq("status","completed").maybeSingle();
 if(roundError||!round?.final_path||!round?.final_sha256) return denied();
 let path=String(round.final_path),expectedSha=String(round.final_sha256);
 if(!path.startsWith("commercial-company-signatures/"+round.id+"/")) return denied();
 const {data:previous,error:previousError}=await admin.from("commercial_signature_invitations")
  .select("id,signed_path,signed_sha256,commercial_signature_participants(signing_order)")
  .eq("request_id",invite.request_id).eq("status","signed");
 if(previousError) return denied();
 const preceding=(previous??[]).map(record=>({
  ...record,order:Number((record.commercial_signature_participants as unknown as {signing_order:number})?.signing_order),
 })).filter(record=>Number.isInteger(record.order)&&record.order<invite.commercial_signature_participants.signing_order)
  .sort((a,b)=>b.order-a.order)[0];
 if(preceding){
  path=String(preceding.signed_path??"");expectedSha=String(preceding.signed_sha256??"");
  if(!path.startsWith("commercial-signatures/"+invite.request_id+"/")) return denied();
 }
 const {data,error}=await admin.storage.from("contract-documents").download(path);
 if(error||!data) return denied();
 const bytes=Buffer.from(await data.arrayBuffer());
 if(!bytes.subarray(0,5).equals(Buffer.from("%PDF-")) ||
  !/^[a-f0-9]{64}$/.test(expectedSha) ||
  createHash("sha256").update(bytes).digest("hex")!==expectedSha) return denied();
 return new NextResponse(bytes,{headers:{
  "Content-Type":"application/pdf",
  "Content-Disposition":'inline; filename="contrato-comercial-para-assinatura.pdf"',
  "Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"SAMEORIGIN",
  "Referrer-Policy":"no-referrer",
 }});
}
