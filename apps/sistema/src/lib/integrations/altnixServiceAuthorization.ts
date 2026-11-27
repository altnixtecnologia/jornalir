import { canonicalIdOrNull } from "./altnixFinanceReadContract";

// Transporte preparatório: não deriva decisão de pagamento global nem de
// revisão jurídica. Somente o futuro emissor de estado/outbox persistido
// poderá fornecer uma autorização. Não gerar novos eventos em retries.
export const ALTNIX_SERVICE_AUTH_ENDPOINT="https://painel.altnix.com.br/apk/api/integrations/jornalir/service-authorization";
export const ALTNIX_SERVICE_AUTH_RELEASED:boolean=false;
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
