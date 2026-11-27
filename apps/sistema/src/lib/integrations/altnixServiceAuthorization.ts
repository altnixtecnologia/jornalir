import { canonicalIdOrNull } from "./altnixFinanceReadContract";

// Transporte preparatório: não deriva decisão de pagamento global nem de
// revisão jurídica. Somente o futuro emissor de estado/outbox persistido
// poderá fornecer uma autorização. Não gerar novos eventos em retries.
export const ALTNIX_SERVICE_AUTH_ENDPOINT="https://painel.altnix.com.br/apk/api/integrations/jornalir/service-authorization";
// Transporte preparado; escrita e worker continuam sob flags independentes de produção.
export const ALTNIX_SERVICE_AUTH_RELEASED:boolean=true;
export const ALTNIX_SERVICE_TENANT="00000000-0000-0000-0000-000000000001";
export type ServiceAuthorizationEvent={
 origin:"jornal_ir"; contractVersion:"1"; serviceCode:"altnix_informativo";
 tenantId:string; advertiserId:string; canonicalClientId:string; canonicalContractId:string;
 canonicalServiceId:string; campaignId:string; eventId:string;
 revision:number; status:"authorized"|"grace"|"suspended"|"ended"; effectiveAt:string;
};
const keys=["origin","contractVersion","serviceCode","tenantId","advertiserId","canonicalClientId","canonicalContractId","canonicalServiceId","campaignId","eventId","revision","status","effectiveAt"];
export function checkedServiceAuthorizationEvent(raw:unknown, nowMs:number):ServiceAuthorizationEvent|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||!Number.isFinite(nowMs))return null;
 const e=raw as Record<string,unknown>;
 if(Object.keys(e).length!==keys.length||keys.some(k=>!Object.hasOwn(e,k))
 ||e.origin!=="jornal_ir"||e.contractVersion!=="1"||e.serviceCode!=="altnix_informativo"||e.tenantId!==ALTNIX_SERVICE_TENANT
 ||!["advertiserId","canonicalClientId","canonicalContractId","canonicalServiceId","campaignId","eventId"].every(k=>typeof e[k]==="string"&&canonicalIdOrNull(e[k])===e[k])
 ||!Number.isSafeInteger(e.revision)||Number(e.revision)<1
 ||!["authorized","grace","suspended","ended"].includes(String(e.status))
 ||typeof e.effectiveAt!=="string"||e.effectiveAt.length>40||!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(e.effectiveAt)
 ||!Number.isFinite(Date.parse(e.effectiveAt))||Date.parse(e.effectiveAt)>nowMs)return null;
 return e as ServiceAuthorizationEvent;
}
export type AuthorizationDelivery="disabled"|"invalid"|"applied"|"review_required"|"retryable";
export function authorizationDeliveryResult(status:number,body:unknown):AuthorizationDelivery{
 const code=body&&typeof body==="object"&&!Array.isArray(body)?(body as Record<string,unknown>).code:null;
 if(status===200&&(code==="applied"||code==="already_applied"))return "applied";
 // O receptor só confirma already_applied se o recibo persistido corresponder
 // ao evento exato. 409 genérico continua sem comprovação de entrega.
 if(status===409||status===400||status===401||status===403||status===415)return "review_required";
 return "retryable";
}
export async function sendServiceAuthorization(raw:unknown):Promise<AuthorizationDelivery>{
 const secret=process.env.JORNALIR_SERVICE_AUTH_WRITE_SECRET;
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"
 ||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true"||!secret||secret.length<32||secret.length>512
 ||[process.env.JORNALIR_FINANCE_BRIDGE_SECRET,process.env.ALTNIX_CLIENT_SYNC_SECRET,process.env.ALTNIX_CLIENT_WRITE_SECRET,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.CRON_SECRET].includes(secret))return "disabled";
 const e=checkedServiceAuthorizationEvent(raw,Date.now());
 if(!e)return "invalid";
 try{
  const response=await fetch(ALTNIX_SERVICE_AUTH_ENDPOINT,{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},body:JSON.stringify(e),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  const body:unknown=await response.json().catch(()=>null);
  return authorizationDeliveryResult(response.status,body);
 }catch{return "retryable";}
}

/** Worker limitado, preparado para reutilizar rotina de servidor existente.
 * Sem agendamento novo. Não reivindica nada enquanto a release estiver fechada.
 * Chamador deve usar exclusivamente o cliente administrativo interno.
 */
export type ServiceOutboxRpc = (name:"altnix_claim_service_authorizations"|"altnix_finish_service_authorization",args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
export async function drainServiceAuthorizationOutbox(rpc:ServiceOutboxRpc):Promise<{claimed:number;acknowledged:number;unconfirmed:number}>{
 const counts={claimed:0,acknowledged:0,unconfirmed:0};
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return counts;
 const claimed=await rpc("altnix_claim_service_authorizations",{p_limit:5});
 if(claimed.error||!Array.isArray(claimed.data)||claimed.data.length>5)return counts;
 for(const row of claimed.data){
  if(!row||typeof row!=="object"||!canonicalIdOrNull(row.event_id)||!canonicalIdOrNull(row.claim_token))continue;
  counts.claimed++;
  const event=checkedServiceAuthorizationEvent(row.payload,Date.now());
  const result=event&&event.eventId===row.event_id?await sendServiceAuthorization(event):"invalid";
  const ack=await rpc("altnix_finish_service_authorization",{p_event:row.event_id,p_token:row.claim_token,p_result:result});
  if(!ack.error&&ack.data===true)counts.acknowledged++;else counts.unconfirmed++;
 }
 return counts;
}


/** Decisão operacional explícita, jamais inferida de status jurídico,
 * total da venda ou confirmação de pagamento global. Ator vem da sessão.
 * operationId é estável durante uma tentativa de decisão.
 */
export function parseServiceDecision(raw:unknown):{serviceId:string;operationId:string;status:ServiceAuthorizationEvent["status"];reason:string}|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==5||!["serviceId","operationId","status","reason","confirmed"].every(k=>Object.hasOwn(v,k))||v.confirmed!==true)return null;
 const serviceId=canonicalIdOrNull(v.serviceId),operationId=canonicalIdOrNull(v.operationId);
 if(!serviceId||!operationId||typeof v.status!=="string"||!["authorized","grace","suspended","ended"].includes(v.status)||typeof v.reason!=="string")return null;
 const reason=v.reason.trim();
 if(reason.length<10||reason.length>500)return null;
 return {serviceId,operationId,status:v.status as ServiceAuthorizationEvent["status"],reason};
}

export type ServiceBindingRequest={serviceId:string;advertiserId:string;campaignId:string};
export type ServiceBindingEnvelope={origin:"jornal_ir";contractVersion:"1";tenantId:string;campaignId:string;advertiserId:string;canonicalClientId:string;canonicalContractId:string;canonicalServiceId:string;approvedBy:string};
export function parseServiceBindingRequest(raw:unknown):ServiceBindingRequest|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;const ids=["serviceId","advertiserId","campaignId"];
 if(Object.keys(v).length!==4||v.confirmed!==true||!ids.every(k=>typeof v[k]==="string"&&canonicalIdOrNull(v[k])===v[k]))return null;
 return {serviceId:v.serviceId as string,advertiserId:v.advertiserId as string,campaignId:v.campaignId as string};
}
export function checkedServiceBinding(raw:unknown,request:ServiceBindingRequest,actor:string):ServiceBindingEnvelope|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==9||v.origin!=="jornal_ir"||v.contractVersion!=="1"||v.tenantId!==ALTNIX_SERVICE_TENANT
 ||v.canonicalServiceId!==request.serviceId||v.advertiserId!==request.advertiserId||v.campaignId!==request.campaignId||v.approvedBy!==actor
 ||!["canonicalClientId","canonicalContractId","canonicalServiceId","advertiserId","campaignId","approvedBy"].every(k=>typeof v[k]==="string"&&canonicalIdOrNull(v[k])===v[k]))return null;
 return v as ServiceBindingEnvelope;
}
export async function sendServiceBinding(binding:ServiceBindingEnvelope):Promise<boolean>{
 const secret=process.env.JORNALIR_SERVICE_AUTH_WRITE_SECRET;
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true"||!secret||secret.length<32||secret.length>512
 ||[process.env.JORNALIR_FINANCE_BRIDGE_SECRET,process.env.ALTNIX_CLIENT_SYNC_SECRET,process.env.ALTNIX_CLIENT_WRITE_SECRET,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.CRON_SECRET].includes(secret))return false;
 try{
  const response=await fetch("https://painel.altnix.com.br/apk/api/integrations/jornalir/service-binding",{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},body:JSON.stringify(binding),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  const body=await response.json().catch(()=>null);return response.status===200&&body?.code==="bound";
 }catch{return false;}
}

export type CampaignOption={campaignId:string;advertiserId:string;name:string;status:"active"|"paused"};
export type CampaignOptions={options:CampaignOption[];complete:boolean};
export function checkedCampaignOptions(raw:unknown):CampaignOptions|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(typeof v.complete!=="boolean"||!Array.isArray(v.options)||v.options.length>50)return null;
 const seen=new Set<string>();const options:CampaignOption[]=[];
 for(const row of v.options){
  if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.campaignId!=="string"||canonicalIdOrNull(row.campaignId)!==row.campaignId||typeof row.advertiserId!=="string"||canonicalIdOrNull(row.advertiserId)!==row.advertiserId||typeof row.name!=="string"||row.name.length>250||!["active","paused"].includes(row.status)||seen.has(row.campaignId))return null;
  seen.add(row.campaignId);options.push({campaignId:row.campaignId,advertiserId:row.advertiserId,name:row.name,status:row.status});
 }
 return {options,complete:v.complete};
}
export async function fetchServiceCampaignOptions(clientId:string,serviceId:string):Promise<CampaignOptions|null>{
 const secret=process.env.JORNALIR_SERVICE_AUTH_WRITE_SECRET;
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true"||!secret||secret.length<32||secret.length>512
 ||[process.env.JORNALIR_FINANCE_BRIDGE_SECRET,process.env.ALTNIX_CLIENT_SYNC_SECRET,process.env.ALTNIX_CLIENT_WRITE_SECRET,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.CRON_SECRET].includes(secret))return null;
 try{
  const response=await fetch("https://painel.altnix.com.br/apk/api/integrations/jornalir/service-binding-options",{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},body:JSON.stringify({canonicalClientId:clientId,canonicalServiceId:serviceId}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  return response.ok?checkedCampaignOptions(await response.json()):null;
 }catch{return null;}
}

export type ServiceFinancialAssessment={state:"authorized"|"grace"|"suspended"|"ended"|"review";reason:string;oldestDue?:string};
export function checkedFinancialAssessment(raw:unknown):ServiceFinancialAssessment|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(!["authorized","grace","suspended","ended","review"].includes(String(v.state))||typeof v.reason!=="string"||!["service_ended","export_revoked","sale_or_period_not_ready","allocation_not_proven","non_monetary_or_undefined","billing_incomplete","no_overdue_balance","overdue_within_grace","overdue_after_grace"].includes(v.reason))return null;
 if(v.oldestDue!==undefined&&(typeof v.oldestDue!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v.oldestDue)))return null;
 return {state:v.state as ServiceFinancialAssessment["state"],reason:v.reason,...(typeof v.oldestDue==="string"?{oldestDue:v.oldestDue}:{})};
}


export type ServiceFinanceBatchScope={saleId:string|null;after:string|null;limit:number};
type ServiceFinanceOutcome="disabled"|"manual_required"|"review"|"unchanged"|"queued";
export type ServiceFinanceBatchRpc=ServiceOutboxRpc extends (name:infer N,args:infer A)=>infer R
 ? (name:N|"altnix_reassess_service_finance_batch",args:A)=>R : never;
export function checkedServiceFinanceBatchScope(raw:unknown):ServiceFinanceBatchScope|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==3||!["saleId","after","limit"].every(k=>Object.hasOwn(v,k))
 ||(v.saleId!==null&&(typeof v.saleId!=="string"||canonicalIdOrNull(v.saleId)!==v.saleId))
 ||(v.after!==null&&(typeof v.after!=="string"||canonicalIdOrNull(v.after)!==v.after))
 ||typeof v.limit!=="number"||!Number.isInteger(v.limit)||v.limit<1||v.limit>50)return null;
 return {saleId:v.saleId as string|null,after:v.after as string|null,limit:v.limit};
}
/** Um lote por chamada autorizada de servidor. Venda específica para eventos
 * financeiros; saleId null para a futura rotina diária. Não cria cron nem
 * repete chamadas automaticamente. O chamador controla o cursor persistido. */
export async function runServiceFinanceBatch(rpc:ServiceFinanceBatchRpc,raw:unknown):Promise<{
 status:"disabled"|"invalid"|"review"|"ok";processed:number;queued:number;review:number;nextCursor:string|null;
}>{
 const empty={processed:0,queued:0,review:0,nextCursor:null};
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return {status:"disabled",...empty};
 const scope=checkedServiceFinanceBatchScope(raw);
 if(!scope)return {status:"invalid",...empty};
 const result=await rpc("altnix_reassess_service_finance_batch",{p_sale:scope.saleId,p_after:scope.after,p_limit:scope.limit});
 if(result.error||!Array.isArray(result.data)||result.data.length>scope.limit)return {status:"review",...empty};
 let previous=scope.after,queued=0,review=0;
 for(const row of result.data){
  if(!row||typeof row!=="object"||typeof row.service_id!=="string"||canonicalIdOrNull(row.service_id)!==row.service_id||(previous!==null&&row.service_id<=previous)
   ||!["disabled","manual_required","review","unchanged","queued"].includes(row.outcome as ServiceFinanceOutcome))return {status:"review",...empty};
  previous=row.service_id;
  if(row.outcome==="queued")queued++;
  if(row.outcome==="review"||row.outcome==="manual_required")review++;
 }
 // Também tenta entregar pendências antigas; a fila limita o lote a cinco.
 try{await drainServiceAuthorizationOutbox(rpc);}catch{/* decisão persistida; retry pela rotina central */}
 return {status:"ok",processed:result.data.length,queued,review,nextCursor:result.data.length===scope.limit?previous:null};
}


export function checkedReceivableEventIds(raw:unknown):string[]|null{
 if(!Array.isArray(raw)||raw.length<1||raw.length>50||raw.some(id=>typeof id!=="string"||canonicalIdOrNull(id)!==id))return null;
 return [...new Set(raw as string[])];
}
export async function reassessAfterReceivableCommit(
 rpc:(name:"altnix_reassess_receivable_services",args:{p_receivable_ids:string[]})=>Promise<{data:unknown;error:unknown}>,raw:unknown
):Promise<"disabled"|"invalid"|"review"|"ok">{
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return "disabled";
 const ids=checkedReceivableEventIds(raw);
 if(!ids)return "invalid";
 try{
  const result=await rpc("altnix_reassess_receivable_services",{p_receivable_ids:ids});
  return !result.error&&typeof result.data==="number"&&Number.isInteger(result.data)&&result.data>=0&&result.data<=50?"ok":"review";
 }catch{return "review";}
}


export type ServiceDailyResult={status:"ok"|"busy";processed:number;queued:number;review:number;complete:boolean};
export function checkedServiceDailyResult(raw:unknown,limit:number):ServiceDailyResult|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||!Number.isInteger(limit)||limit<1||limit>50)return null;
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==5||(v.status!=="ok"&&v.status!=="busy")||typeof v.complete!=="boolean"
 ||typeof v.processed!=="number"||!Number.isInteger(v.processed)||v.processed<0||v.processed>limit
 ||typeof v.queued!=="number"||!Number.isInteger(v.queued)||v.queued<0
 ||typeof v.review!=="number"||!Number.isInteger(v.review)||v.review<0||v.queued+v.review>v.processed
 ||(v.status==="busy"&&(v.processed!==0||v.complete)))return null;
 return {status:v.status,processed:v.processed,queued:v.queued,review:v.review,complete:v.complete};
}
export type ServiceDailyRpc=(name:"altnix_run_daily_service_finance"|"altnix_claim_service_authorizations"|"altnix_finish_service_authorization",args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
/** Uma execução central limitada. Mesmo após completar o dia, recupera
 * a fila de entrega existente. Não faz consultas por dispositivo. */
export async function runDailyServiceFinance(rpc:ServiceDailyRpc):Promise<{
 status:"disabled"|"review"|"ok"|"busy";daily:ServiceDailyResult|null;delivery:{claimed:number;acknowledged:number;unconfirmed:number}|null;
}>{
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true"||process.env.JORNALIR_SERVICE_FINANCE_WORKER_ENABLED!=="true")return {status:"disabled",daily:null,delivery:null};
 const limit=25;
 let daily:ServiceDailyResult|null=null;
 try{
  const result=await rpc("altnix_run_daily_service_finance",{p_limit:limit});
  if(!result.error)daily=checkedServiceDailyResult(result.data,limit);
 }catch{/* retry no próximo ciclo */}
 // Um erro na avaliação não impede recuperar eventos já persistidos.
 let delivery:null|{claimed:number;acknowledged:number;unconfirmed:number}=null;
 try{delivery=await drainServiceAuthorizationOutbox(rpc);}catch{/* retry pela fila */}
 return {status:!daily||!delivery?"review":daily.status,daily,delivery};
}


export type ServiceBridgeHealth={code:"ready";contractVersion:"1";writeEnabled:boolean};
export function checkedServiceBridgeHealth(raw:unknown):ServiceBridgeHealth|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 return Object.keys(v).length===3&&v.code==="ready"&&v.contractVersion==="1"&&typeof v.writeEnabled==="boolean"
 ? {code:"ready",contractVersion:"1",writeEnabled:v.writeEnabled}:null;
}
/** Somente teste manual de comunicação; usa a mesma credencial de escrita,
 * mas não exige que a escrita esteja ativada e não envia dados de cliente. */
export async function probeServiceBridge():Promise<{receiverWriteEnabled:boolean;senderWriteEnabled:boolean}|null>{
 const secret=process.env.JORNALIR_SERVICE_AUTH_WRITE_SECRET;
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||!secret||secret.length<32||secret.length>512
 ||[process.env.JORNALIR_FINANCE_BRIDGE_SECRET,process.env.ALTNIX_CLIENT_SYNC_SECRET,process.env.ALTNIX_CLIENT_WRITE_SECRET,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.CRON_SECRET].includes(secret))return null;
 try{
  const result=await fetch("https://painel.altnix.com.br/apk/api/integrations/jornalir/service-binding-options",{method:"GET",headers:{Authorization:"Bearer "+secret},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  if(!result.ok)return null;
  const health=checkedServiceBridgeHealth(await result.json());
  return health?{receiverWriteEnabled:health.writeEnabled,senderWriteEnabled:process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED==="true"}:null;
 }catch{return null;}
}
