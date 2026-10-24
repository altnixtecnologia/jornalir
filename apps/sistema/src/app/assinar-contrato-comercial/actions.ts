"use server";
import {createHash} from "node:crypto";
import {headers} from "next/headers";
import sharp from "sharp";
import {createSupabaseServerClient} from "../../lib/supabase/server";
import {createSupabaseAdminClient} from "../../lib/supabase/admin";
import {
 commercialInvitationPending,commercialTokenHash,findCommercialInvitation,
} from "../../lib/signatures/commercialSignatures";
import {buildSignatureReceiptPdf} from "../../lib/signatures/signatureReceiptPdf";
import {buildSignedContractPdf} from "../../lib/signatures/signedContractPdf";
import {persistCommercialEvidence,sha256Evidence} from "../../lib/signatures/commercialEvidenceStorage";

type Result<T=never>={error:string}|({ok:true}&T);
const BUCKET="contract-documents";
function normalized(name:string):string {return name.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR");}

export async function sendCommercialSignatureOtpAction(token:string):Promise<Result<{sent:true}>> {
 try{
  const invite=await findCommercialInvitation(token);
  if(!invite||!commercialInvitationPending(invite)) return {error:"Convite expirado ou indisponível."};
  // Registrar a tentativa ANTES do envio, para bloquear spam de OTP
  // mesmo com múltiplas requisições simultâneas do mesmo link.
  const admin=createSupabaseAdminClient();
  const {error:rateError}=await admin.rpc("reserve_commercial_signature_otp",{
   p_token_sha256:commercialTokenHash(token),
  });
  if(rateError) return {error:rateError.message};
  const db=createSupabaseServerClient();
  const {error}=await db.auth.signInWithOtp({
   email:invite.commercial_signature_participants.signer_email,
   options:{shouldCreateUser:true,data:{account_purpose:"contract_signer",signature_kind:"commercial"}},
  });
  if(error) return {error:"Não foi possível enviar o código. Confira SMTP e limites do Supabase Auth."};
  return {ok:true,sent:true};
 }catch{return {error:"Serviço de confirmação de e-mail indisponível."};}
}
export async function verifyCommercialSignatureOtpAction(token:string,code:string):Promise<Result<{verified:true}>> {
 try{
  const invite=await findCommercialInvitation(token);
  if(!invite||!commercialInvitationPending(invite)) return {error:"Convite indisponível."};
  if(!/^\d{6,8}$/.test(code.trim())) return {error:"Código de e-mail inválido."};
  const db=createSupabaseServerClient();
  const {data,error}=await db.auth.verifyOtp({
   email:invite.commercial_signature_participants.signer_email,
   token:code.trim(),type:"email",
  });
  if(error||!data.user?.id ||
    data.user.email?.toLowerCase()!==invite.commercial_signature_participants.signer_email.toLowerCase()) {
   return {error:"Código incorreto ou expirado."};
  }
  const admin=createSupabaseAdminClient();
  const saved=await admin.rpc("verify_commercial_signer_email",{
   p_token_sha256:commercialTokenHash(token),p_auth_user_id:data.user.id,
  });
  if(saved.error) return {error:"Não foi possível vincular a confirmação ao convite."};
  return {ok:true,verified:true};
 }catch{return {error:"Falha na confirmação de e-mail."};}
}

export async function completeCommercialSignatureAction(input:{
 token:string;name:string;email:string;consent:boolean;imageDataUrl:string;
}):Promise<Result<{completed:boolean}>> {
 if(!input.consent) return {error:"É obrigatório declarar consentimento para assinar."};
 const invite=await findCommercialInvitation(input.token);
 if(!invite||!commercialInvitationPending(invite)) return {error:"Convite utilizado, revogado ou expirado."};
 const person=invite.commercial_signature_participants;
 if(normalized(input.name)!==normalized(person.signer_name) ||
    input.email.trim().toLowerCase()!==person.signer_email.toLowerCase()) {
  return {error:"Nome e e-mail devem corresponder ao convite."};
 }
 const db=createSupabaseServerClient();
 const {data:user,error:userError}=await db.auth.getUser();
 if(userError||!user.user||user.user.email?.toLowerCase()!==person.signer_email.toLowerCase()) {
  return {error:"Confirme o OTP de e-mail deste convite antes de assinar."};
 }
 const match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.imageDataUrl);
 if(!match||match[1].length>1100000) return {error:"Imagem da assinatura inválida."};
 const png=Buffer.from(match[1],"base64");
 if(png.length<150||png.length>800000) return {error:"Desenhe a assinatura para continuar."};
 let jpeg:Buffer;
 try{
  const info=await sharp(png).metadata();
  if(info.format!=="png"||!info.width||!info.height||info.width>2400||info.height>1200)
   return {error:"Formato de assinatura inválido."};
  const stats=await sharp(png).flatten({background:"#ffffff"}).stats();
  if((stats.channels[0]?.stdev??0)<3) return {error:"Desenhe a assinatura no campo indicado."};
  jpeg=await sharp(png).flatten({background:"#ffffff"})
   .resize({width:640,height:240,fit:"contain",background:"#ffffff"})
   .jpeg({quality:82}).toBuffer();
 }catch{return {error:"Não foi possível processar a assinatura."};}
 const admin=createSupabaseAdminClient();
 const hash=commercialTokenHash(input.token);
 let invitationId:string|null=null;
 try{
  const {data,error}=await admin.rpc("claim_commercial_signature_turn",{
   p_token_sha256:hash,p_auth_user_id:user.user.id,
  });
  if(error||!data||!(data as unknown[]).length)
   return {error:error?.message??"Não foi possível iniciar a assinatura."};
  const source=(data as Array<{
   invitation_id:string;request_id:string;source_path:string;source_sha256:string;document_title:string;
  }>)[0];
  invitationId=source.invitation_id;
  const {data:original,error:downloadError}=await admin.storage.from(BUCKET).download(source.source_path);
  if(downloadError||!original) throw new Error("PDF base indisponível.");
  const bytes=Buffer.from(await original.arrayBuffer());
  const originalHash=createHash("sha256").update(bytes).digest("hex");
  if(!bytes.subarray(0,5).equals(Buffer.from("%PDF-"))||originalHash!==source.source_sha256)
   throw new Error("Integridade do PDF base não confirmada.");
  // A tentativa fica persistida ANTES de qualquer upload. Se a função
  // falhar após gravar um ou dois arquivos, a próxima chamada retoma
  // o mesmo instante de aceite e a mesma assinatura, sem sobrescrever.
  const proposedSignatureHash=sha256Evidence(jpeg);
  const {data:attemptRows,error:attemptError}=await admin.rpc(
   "begin_commercial_signature_attempt",{
    p_invitation_id:source.invitation_id,
    p_signer_user_id:user.user.id,
    p_source_sha256:originalHash,
    p_signature_sha256:proposedSignatureHash,
   });
  if(attemptError||!Array.isArray(attemptRows)||!attemptRows[0])
   throw new Error(attemptError?.message??"Não foi possível recuperar a tentativa de assinatura.");
  const attempt=attemptRows[0] as {signature_hash:string;accepted_at:string};
  const signedAt=new Date(attempt.accepted_at).toISOString();
  const jpegPath="commercial/"+source.invitation_id+".jpg";
  const base="commercial-signatures/"+source.request_id+"/"+source.invitation_id;
  const receiptPath=base+"-receipt.pdf";
  const signedPath=base+"-signed.pdf";
  const originalJpeg=await persistCommercialEvidence(admin,{
    bucket:"contract-signatures",path:jpegPath,format:"image/jpeg",
    candidate:proposedSignatureHash===attempt.signature_hash?jpeg:undefined,
    expectedSha256:attempt.signature_hash,
  });
  const signatureBytes=originalJpeg.bytes;
  const jpegInfo=await sharp(signatureBytes).metadata();
  const receiptCandidate=buildSignatureReceiptPdf({
   signerName:person.signer_name,signerEmail:person.signer_email,
   documentName:source.document_title,contractNumber:source.request_id,
   signedAt,originalSha256:originalHash,invitationId:source.invitation_id,
   consentVersion:"commercial-v1",sourceIsCumulative:true,
   jpegBytes:signatureBytes,jpegWidth:jpegInfo.width??640,jpegHeight:jpegInfo.height??240,
  });
  const receipt=await persistCommercialEvidence(admin,{
   bucket:BUCKET,path:receiptPath,format:"application/pdf",
   candidate:receiptCandidate,
  });
  const signedCandidate=await buildSignedContractPdf({
   originalBytes:bytes,signatureJpeg:signatureBytes,documentName:source.document_title,
   signerName:person.signer_name,signerEmail:person.signer_email,
   signedAt,originalSha256:originalHash,invitationId:source.invitation_id,
   consentVersion:"commercial-v1",sourceIsCumulative:true,
  });
  if(signedCandidate.byteLength>10*1024*1024)
    throw new Error("PDF assinado excede 10 MB.");
  const signed=await persistCommercialEvidence(admin,{
   bucket:BUCKET,path:signedPath,format:"application/pdf",candidate:signedCandidate,
  });
  if(signed.bytes.length>10*1024*1024)
   throw new Error("PDF previamente armazenado excede 10 MB.");
  const h=headers(),ip=h.get("x-real-ip")??h.get("x-forwarded-for")?.split(",")[0]?.trim()??"";
  const audit={
   acceptedAt:signedAt,method:"verified-email-otp-and-graphical-consent",
   ipHash:ip?createHash("sha256").update(ip).digest("hex"):null,
   userAgent:(h.get("user-agent")??"").slice(0,300),
  };
  const final=await admin.rpc("finalize_commercial_signature",{
   p_token_sha256:hash,p_auth_user_id:user.user.id,p_original_sha256:originalHash,
   p_signature_sha256:originalJpeg.sha256,
   p_receipt_sha256:receipt.sha256,
   p_signed_sha256:signed.sha256,p_audit:audit,
  });
  if(final.error) throw new Error("Arquivos salvos, mas finalização pendente de reconciliação: "+final.error.message);
  return {ok:true,completed:final.data===true};
 }catch(e){
  return {error:e instanceof Error?e.message:"Falha ao registrar assinatura."};
 }finally{
  if(invitationId) await admin.rpc("release_commercial_signature_turn",{p_invitation_id:invitationId});
 }
}
