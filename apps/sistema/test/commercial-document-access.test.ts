import test from "node:test";
import assert from "node:assert/strict";
import {canReadCommercialInvitationPdf} from "../src/lib/signatures/commercialDocumentAccess";
const valid={
 invitationPending:true,
 verifiedUserId:"user-123",verifiedAt:"2026-10-24T01:00:00.000Z",
 invitedEmail:"signer@example.com",
 sessionUserId:"user-123",sessionEmail:"SIGNER@EXAMPLE.COM",
};
test("PDF comercial só é liberado à sessão confirmada do destinatário",()=>{
 assert.equal(canReadCommercialInvitationPdf(valid),true);
});
test("token vazado sem OTP não dá acesso ao PDF privado",()=>{
 assert.equal(canReadCommercialInvitationPdf({...valid,verifiedAt:null}),false);
 assert.equal(canReadCommercialInvitationPdf({...valid,verifiedUserId:null}),false);
 assert.equal(canReadCommercialInvitationPdf({...valid,sessionUserId:null,sessionEmail:null}),false);
});
test("sessão de outra pessoa não pode usar convite válido",()=>{
 assert.equal(canReadCommercialInvitationPdf({...valid,sessionUserId:"attacker"}),false);
 assert.equal(canReadCommercialInvitationPdf({...valid,sessionEmail:"other@example.com"}),false);
});
test("convite utilizado, expirado ou revogado não abre documento",()=>{
 assert.equal(canReadCommercialInvitationPdf({...valid,invitationPending:false}),false);
});
