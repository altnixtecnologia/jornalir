import "server-only";
import {createHash} from "node:crypto";
import {createSupabaseAdminClient} from "../supabase/admin";

export interface CommercialInvitation {
 id:string; request_id:string; participant_id:string;
 status:"pending"|"signed"|"revoked"; expires_at:string;
 verified_at:string|null; verified_user_id:string|null; signed_at:string|null;
 commercial_signature_participants:{
  signer_name:string;signer_email:string;signer_role:string;signing_order:number;
 };
 commercial_signature_requests:{
  status:"pending"|"completed"|"cancelled";preparation_id:string;
  commercial_signature_preparations:{
   document_id:string;commercial_contract_documents:{
    title:string;file_reference:string;sha256:string;package_id:string;
   };
  };
 };
}
export function commercialTokenHash(token:string):string {
 return createHash("sha256").update(token,"utf8").digest("hex");
}
export async function findCommercialInvitation(token:string):Promise<CommercialInvitation|null> {
 if(!/^[a-f0-9]{64}$/i.test(token)) return null;
 const admin=createSupabaseAdminClient();
 const {data,error}=await admin.from("commercial_signature_invitations")
  .select("id,request_id,participant_id,status,expires_at,verified_at,verified_user_id,signed_at,commercial_signature_participants(signer_name,signer_email,signer_role,signing_order),commercial_signature_requests(status,preparation_id,commercial_signature_preparations(document_id,commercial_contract_documents(title,file_reference,sha256,package_id)))")
  .eq("token_sha256",commercialTokenHash(token)).maybeSingle();
 if(error||!data) return null;
 return data as unknown as CommercialInvitation;
}
export function commercialInvitationPending(invite:CommercialInvitation):boolean {
 return invite.status==="pending"&&invite.commercial_signature_requests.status==="pending"
   &&Date.parse(invite.expires_at)>Date.now();
}
