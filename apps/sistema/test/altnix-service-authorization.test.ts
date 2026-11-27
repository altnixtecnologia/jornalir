import {test} from "node:test";
import assert from "node:assert/strict";
import {ALTNIX_SERVICE_AUTH_RELEASED,ALTNIX_SERVICE_TENANT,ALTNIX_SERVICE_AUTH_ENDPOINT,checkedServiceAuthorizationEvent,authorizationDeliveryResult,sendServiceAuthorization,drainServiceAuthorizationOutbox} from "../src/lib/integrations/altnixServiceAuthorization";
const uuid=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const event={origin:"jornal_ir",contractVersion:"1",serviceCode:"altnix_informativo",tenantId:ALTNIX_SERVICE_TENANT,
 advertiserId:uuid(2),canonicalClientId:uuid(3),canonicalContractId:uuid(4),canonicalServiceId:uuid(5),
 localContractId:uuid(6),campaignId:uuid(7),eventId:uuid(8),revision:1,status:"authorized",effectiveAt:"2026-11-26T00:00:00Z"};
const now=Date.parse("2026-11-27T00:00:00Z");
test("contrato estrito compatível com Informativo",()=>{
 assert.deepEqual(checkedServiceAuthorizationEvent(event,now),event);
 for(const change of [{tenantId:uuid(9)},{origin:"informativo"},{serviceCode:"other"},{status:"paid"},{revision:0},{effectiveAt:"2026-11-28T00:00:00Z"},{canonicalServiceId:null},{extra:true}])assert.equal(checkedServiceAuthorizationEvent({...event,...change},now),null);
 assert.equal(ALTNIX_SERVICE_AUTH_ENDPOINT,"https://painel.altnix.com.br/apk/api/integrations/jornalir/service-authorization");
});
test("não considerar conflito como autorização entregue",()=>{
 assert.equal(authorizationDeliveryResult(200,{code:"applied"}),"applied");
 assert.equal(authorizationDeliveryResult(200,{code:"already_applied"}),"applied");
 assert.equal(authorizationDeliveryResult(200,{code:"other"}),"retryable");
 assert.equal(authorizationDeliveryResult(409,{code:"not_applied"}),"review_required");
 assert.equal(authorizationDeliveryResult(503,null),"retryable");
});
test("transporte desabilitado até autorização persistida e homologação",async()=>{
 assert.equal(ALTNIX_SERVICE_AUTH_RELEASED,false);
 assert.equal(await sendServiceAuthorization(event),"disabled");
});

test("fila não é consultada com release desativada",async()=>{
 let calls=0;
 assert.deepEqual(await drainServiceAuthorizationOutbox(async()=>{calls++;return {data:null,error:null};}),{claimed:0,acknowledged:0,unconfirmed:0});
 assert.equal(calls,0);
});
