import {test} from "node:test";
import assert from "node:assert/strict";
import {ALTNIX_SERVICE_AUTH_RELEASED,ALTNIX_SERVICE_TENANT,ALTNIX_SERVICE_AUTH_ENDPOINT,checkedServiceAuthorizationEvent,authorizationDeliveryResult,sendServiceAuthorization,drainServiceAuthorizationOutbox,parseServiceDecision,parseServiceBindingRequest,checkedServiceBinding,checkedCampaignOptions} from "../src/lib/integrations/altnixServiceAuthorization";
const uuid=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const event={origin:"jornal_ir",contractVersion:"1",serviceCode:"altnix_informativo",tenantId:ALTNIX_SERVICE_TENANT,
 advertiserId:uuid(2),canonicalClientId:uuid(3),canonicalContractId:uuid(4),canonicalServiceId:uuid(5),
 campaignId:uuid(7),eventId:uuid(8),revision:1,status:"authorized",effectiveAt:"2026-11-26T00:00:00Z"};
const now=Date.parse("2026-11-27T00:00:00Z");
test("contrato estrito compatível com Informativo",()=>{
 assert.deepEqual(checkedServiceAuthorizationEvent(event,now),event);
 for(const change of [{localContractId:uuid(6)},{tenantId:uuid(9)},{origin:"informativo"},{serviceCode:"other"},{status:"paid"},{revision:0},{effectiveAt:"2026-11-28T00:00:00Z"},{canonicalServiceId:null},{extra:true}])assert.equal(checkedServiceAuthorizationEvent({...event,...change},now),null);
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

test("decisão exige confirmação e não aceita ator ou identificadores externos",()=>{
 const raw={serviceId:uuid(5),operationId:uuid(8),status:"suspended",reason:"Suspensão expressamente confirmada",confirmed:true};
 assert.equal(parseServiceDecision(raw)?.status,"suspended");
 for(const change of [{confirmed:false},{reason:"curta"},{actorId:uuid(4)},{status:"paid"},{operationId:null}])assert.equal(parseServiceDecision({...raw,...change}),null);
});

test("vínculo exige confirmação e envelope retornado corresponde exatamente à operação",()=>{
 const raw={serviceId:uuid(5),advertiserId:uuid(2),campaignId:uuid(7),confirmed:true};
 const command=parseServiceBindingRequest(raw);assert.ok(command);
 assert.equal(parseServiceBindingRequest({...raw,confirmed:false}),null);
 const envelope={origin:"jornal_ir",contractVersion:"1",tenantId:ALTNIX_SERVICE_TENANT,campaignId:uuid(7),advertiserId:uuid(2),canonicalClientId:uuid(3),canonicalContractId:uuid(4),canonicalServiceId:uuid(5),approvedBy:uuid(8)};
 assert.deepEqual(checkedServiceBinding(envelope,command,uuid(8)),envelope);
 assert.equal(checkedServiceBinding({...envelope,campaignId:uuid(9)},command,uuid(8)),null);
});

test("opções de campanha limitadas, válidas e sem duplicidade",()=>{
 const option={campaignId:uuid(7),advertiserId:uuid(2),name:"Campanha",status:"active"};
 assert.deepEqual(checkedCampaignOptions({options:[option],complete:true}),{options:[option],complete:true});
 assert.equal(checkedCampaignOptions({options:[option,option],complete:true}),null);
 assert.equal(checkedCampaignOptions({options:[{...option,status:"archived"}],complete:true}),null);
 assert.equal(checkedCampaignOptions({options:[{...option,campaignId:"wrong"}],complete:true}),null);
});
