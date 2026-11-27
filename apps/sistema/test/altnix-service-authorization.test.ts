import {test} from "node:test";
import assert from "node:assert/strict";
import {ALTNIX_SERVICE_AUTH_RELEASED,ALTNIX_SERVICE_TENANT,ALTNIX_SERVICE_AUTH_ENDPOINT,checkedServiceAuthorizationEvent,authorizationDeliveryResult,sendServiceAuthorization,drainServiceAuthorizationOutbox,parseServiceDecision,parseServiceBindingRequest,checkedServiceBinding,checkedCampaignOptions,checkedServiceFinanceBatchScope,runServiceFinanceBatch,checkedReceivableEventIds,reassessAfterReceivableCommit,checkedServiceDailyResult,runDailyServiceFinance} from "../src/lib/integrations/altnixServiceAuthorization";
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


test("lote financeiro exige escopo explícito, cursor válido e limite de 50",()=>{
 const scope={saleId:uuid(2),after:null,limit:25};
 assert.deepEqual(checkedServiceFinanceBatchScope(scope),scope);
 assert.deepEqual(checkedServiceFinanceBatchScope({saleId:null,after:uuid(5),limit:50}),{saleId:null,after:uuid(5),limit:50});
 for(const invalid of [{...scope,saleId:"invalid"},{...scope,after:"invalid"},{...scope,limit:0},{...scope,limit:51},{...scope,limit:1.5},{...scope,actorId:uuid(9)},{after:null,limit:25}])assert.equal(checkedServiceFinanceBatchScope(invalid),null);
});
test("lote financeiro não toca o banco nem a fila antes da release",async()=>{
 let calls=0;
 assert.deepEqual(await runServiceFinanceBatch(async()=>{calls++;return {data:null,error:null};},{saleId:null,after:null,limit:25}),{status:"disabled",processed:0,queued:0,review:0,nextCursor:null});
 assert.equal(calls,0);
});


test("eventos de títulos são limitados, deduplicados e não aceitam IDs arbitrários inválidos",()=>{
 assert.deepEqual(checkedReceivableEventIds([uuid(2),uuid(2),uuid(3)]),[uuid(2),uuid(3)]);
 for(const invalid of [[],[null],["wrong"],Array(51).fill(uuid(2)),{id:uuid(2)}])assert.equal(checkedReceivableEventIds(invalid),null);
});
test("evento financeiro confirmado não toca RPC com integração desativada",async()=>{
 let calls=0;
 assert.equal(await reassessAfterReceivableCommit(async()=>{calls++;return {data:1,error:null};},[uuid(2)]),"disabled");
 assert.equal(calls,0);
});


test("resposta diária limitada e estado concorrente validado",()=>{
 const good={status:"ok",processed:25,queued:2,review:3,complete:false};
 assert.deepEqual(checkedServiceDailyResult(good,25),good);
 assert.deepEqual(checkedServiceDailyResult({status:"busy",processed:0,queued:0,review:0,complete:false},25),{status:"busy",processed:0,queued:0,review:0,complete:false});
 for(const bad of [{...good,processed:26},{...good,queued:24},{...good,review:-1},{...good,status:"busy"},{...good,complete:"false"},{...good,extra:1}])assert.equal(checkedServiceDailyResult(bad,25),null);
});
test("rotina diária não acessa banco com release desligada",async()=>{
 let calls=0;
 assert.deepEqual(await runDailyServiceFinance(async()=>{calls++;return {data:null,error:null};}),{status:"disabled",daily:null,delivery:null});
 assert.equal(calls,0);
});
