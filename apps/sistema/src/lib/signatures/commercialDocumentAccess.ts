/** Documento contratual privado: URL de convite não equivale a autorização. */
export function canReadCommercialInvitationPdf(input:{
 invitationPending:boolean;
 verifiedUserId:string|null;
 verifiedAt:string|null;
 invitedEmail:string;
 sessionUserId:string|null;
 sessionEmail:string|null;
}):boolean {
 return input.invitationPending && Boolean(input.verifiedAt)
  && Boolean(input.verifiedUserId) && Boolean(input.sessionUserId)
  && input.verifiedUserId===input.sessionUserId
  && input.invitedEmail.trim().toLowerCase()===input.sessionEmail?.trim().toLowerCase();
}
