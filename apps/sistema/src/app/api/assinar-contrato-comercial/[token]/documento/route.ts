import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {createSupabaseAdminClient} from "../../../../../lib/supabase/admin";
import {createSupabaseServerClient} from "../../../../../lib/supabase/server";
import {canReadCommercialInvitationPdf} from "../../../../../lib/signatures/commercialDocumentAccess";
import {findCommercialInvitation,commercialInvitationPending} from "../../../../../lib/signatures/commercialSignatures";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(_req:Request,{params}:{params:{token:string}}):Promise<NextResponse>{
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
