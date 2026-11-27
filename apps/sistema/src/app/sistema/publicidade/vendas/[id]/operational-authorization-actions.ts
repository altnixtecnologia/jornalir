"use server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { canonicalIdOrNull } from "../../../../../lib/integrations/altnixFinanceReadContract";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { ALTNIX_SERVICE_AUTH_RELEASED,parseServiceDecision,checkedServiceAuthorizationEvent,drainServiceAuthorizationOutbox,parseServiceBindingRequest,checkedServiceBinding,sendServiceBinding,fetchServiceCampaignOptions,type CampaignOptions,checkedFinancialAssessment,type ServiceFinancialAssessment } from "../../../../../lib/integrations/altnixServiceAuthorization";

type Result={ok:true;queued:true;delivery:"confirmed"|"pending"}|{error:string};
/** Preparação de ponto de decisão humana; não é autorização automática
 * pelo financeiro. Não conectar a UI antes da homologação do fluxo.
 */
export async function authorizeAltnixServiceAction(raw:unknown):Promise<Result>{
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return {error:"Autorização operacional ainda não habilitada."};
 const command=parseServiceDecision(raw);
 if(!command)return {error:"Confirme a decisão e informe a justificativa."};
 const denied=await checkModuleAction("publicidade","contratos_revisar");
 if(denied)return {error:denied};
 try{
  const session=createSupabaseServerClient();
  const {data:auth,error:authError}=await session.auth.getUser();
  if(authError||!auth.user)return {error:"Sessão inválida."};
  const {data:profile,error:profileError}=await session.from("profiles").select("role,active").eq("id",auth.user.id).maybeSingle();
  if(profileError||!profile?.active||profile.role!=="owner")return {error:"Operação reservada ao proprietário."};
  const admin=createSupabaseAdminClient();
  const {data,error}=await admin.rpc("altnix_queue_service_authorization",{
    p_service:command.serviceId,p_event:command.operationId,p_actor:auth.user.id,p_state:command.status,
    p_effective:null,p_reason:command.reason
  });
  if(error||!checkedServiceAuthorizationEvent(data,Date.now()))return {error:"Vínculo ou decisão não confirmado."};
  // A fila é persistida antes do envio. Falha de rede mantém a decisão.
  // Não confundir a confirmação de outros eventos do lote com a deste.
  try{await drainServiceAuthorizationOutbox(async(name,args)=>await admin.rpc(name,args));}catch{/* pendência permanece */}
  return {ok:true,queued:true,delivery:"pending"};
 }catch{return {error:"Autorização temporariamente indisponível."};}
}

export async function readAltnixServiceAuthorizationAction(serviceId:string):Promise<{ok:true;binding:null|{campaignId:string;enabled:boolean;revision:number;status:string|null;delivery:string}}|{error:string}>{
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return {error:"Integração operacional aguardando homologação."};
 if(canonicalIdOrNull(serviceId)!==serviceId)return {error:"Serviço inválido."};
 try{
  const denied=await checkModuleAction("publicidade","contratos_revisar");if(denied)return {error:denied};
  const session=createSupabaseServerClient();const {data:auth,error}=await session.auth.getUser();
  if(error||!auth.user)return {error:"Sessão inválida."};
  const {data:profile}=await session.from("profiles").select("role,active").eq("id",auth.user.id).maybeSingle();
  if(!profile?.active||profile.role!=="owner")return {error:"Operação reservada ao proprietário."};
  const {data:service,error:serviceError}=await session.from("commercial_contract_services").select("id,service_channel").eq("id",serviceId).maybeSingle();
  if(serviceError||service?.service_channel!=="led_panel")return {error:"Serviço não disponível."};
  const {data,error:rpcError}=await createSupabaseAdminClient().rpc("altnix_read_service_authorization",{p_service:serviceId});
  if(rpcError)return {error:"Vínculo indisponível."};
  if(data===null)return {ok:true,binding:null};
  if(typeof data!=="object"||canonicalIdOrNull(data.campaignId)!==data.campaignId||typeof data.enabled!=="boolean"||!Number.isSafeInteger(data.revision)||data.revision<0||![null,"authorized","grace","suspended","ended"].includes(data.status)||!["none","confirmed","review","pending"].includes(data.delivery))return {error:"Resposta operacional inválida."};
  return {ok:true,binding:{campaignId:data.campaignId,enabled:data.enabled,revision:data.revision,status:data.status,delivery:data.delivery}};
 }catch{return {error:"Consulta operacional indisponível."};}
}

export async function bindAltnixServiceAction(raw:unknown):Promise<{ok:true}|{error:string}>{
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return {error:"Integração operacional aguardando homologação."};
 const command=parseServiceBindingRequest(raw);if(!command)return {error:"Selecione a campanha e confirme o vínculo."};
 try{
  const denied=await checkModuleAction("publicidade","contratos_revisar");if(denied)return {error:denied};
  const session=createSupabaseServerClient();const {data:auth,error}=await session.auth.getUser();if(error||!auth.user)return {error:"Sessão inválida."};
  const {data:profile}=await session.from("profiles").select("role,active").eq("id",auth.user.id).maybeSingle();
  if(!profile?.active||profile.role!=="owner")return {error:"Operação reservada ao proprietário."};
  const {data:service,error:serviceError}=await session.from("commercial_contract_services").select("id,service_channel").eq("id",command.serviceId).maybeSingle();
  if(serviceError||service?.service_channel!=="led_panel")return {error:"Serviço não disponível."};
  const admin=createSupabaseAdminClient(),args={p_service:command.serviceId,p_advertiser:command.advertiserId,p_campaign:command.campaignId,p_actor:auth.user.id};
  // Conferir campanha remota antes de reservar: evita fixar um UUID errado.
  const {data:context,error:contextError}=await admin.rpc("altnix_service_binding_context",{p_service:command.serviceId});
  if(contextError||!context||canonicalIdOrNull(context.clientId)!==context.clientId)return {error:"Cliente sem seleção autorizada."};
  if(context.campaignId&&(context.campaignId!==command.campaignId||context.advertiserId!==command.advertiserId))return {error:"Já existe reserva para outra campanha."};
  const candidates=await fetchServiceCampaignOptions(context.clientId,command.serviceId);
  if(!candidates?.options.some(c=>c.campaignId===command.campaignId&&c.advertiserId===command.advertiserId))return {error:"Campanha não está disponível para este cliente e serviço."};
  const {data,error:prepareError}=await admin.rpc("altnix_prepare_service_binding",args);
  const binding=checkedServiceBinding(data,command,auth.user.id);
  if(prepareError||!binding)return {error:"Vínculo indisponível, conflitante ou cliente sem seleção autorizada."};
  if(!await sendServiceBinding(binding))return {error:"Vínculo reservado, mas não confirmado pelo Informativo. Confira os mesmos dados e repita; nenhuma autorização foi criada."};
  const confirmed=await admin.rpc("altnix_confirm_service_binding",args);
  if(confirmed.error||confirmed.data!==true)return {error:"Informativo confirmou, mas falta registrar a confirmação central. Repita os mesmos dados."};
  return {ok:true};
 }catch{return {error:"Não foi possível confirmar o vínculo. Consulte a situação antes de repetir."};}
}

export async function listAltnixServiceCampaignsAction(serviceId:string):Promise<{ok:true;result:CampaignOptions}|{error:string}>{
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return {error:"Integração operacional aguardando homologação."};
 if(canonicalIdOrNull(serviceId)!==serviceId)return {error:"Serviço inválido."};
 try{
  const denied=await checkModuleAction("publicidade","contratos_revisar");if(denied)return {error:denied};
  const session=createSupabaseServerClient();const {data:auth,error}=await session.auth.getUser();if(error||!auth.user)return {error:"Sessão inválida."};
  const {data:profile}=await session.from("profiles").select("role,active").eq("id",auth.user.id).maybeSingle();
  if(!profile?.active||profile.role!=="owner")return {error:"Operação reservada ao proprietário."};
  const {data:service,error:serviceError}=await session.from("commercial_contract_services").select("id,service_channel").eq("id",serviceId).maybeSingle();
  if(serviceError||service?.service_channel!=="led_panel")return {error:"Serviço não disponível."};
  const {data:context,error:contextError}=await createSupabaseAdminClient().rpc("altnix_service_binding_context",{p_service:serviceId});
  if(contextError||!context||canonicalIdOrNull(context.clientId)!==context.clientId)return {error:"Cliente sem seleção autorizada."};
  const result=await fetchServiceCampaignOptions(context.clientId,serviceId);
  if(!result)return {error:"Campanhas indisponíveis."};
  return {ok:true,result:{...result,options:result.options.filter(c=>!context.campaignId||(context.campaignId===c.campaignId&&context.advertiserId===c.advertiserId))}};
 }catch{return {error:"Consulta de campanhas indisponível."};}
}

/** Simulação explícita; não configura tolerância nem publica autorização. */
export async function assessAltnixServiceFinanceAction(serviceId:string,graceDays:number):Promise<{ok:true;assessment:ServiceFinancialAssessment}|{error:string}>{
 if(!ALTNIX_SERVICE_AUTH_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.JORNALIR_SERVICE_AUTH_WRITE_ENABLED!=="true")return {error:"Integração operacional aguardando homologação."};
 if(canonicalIdOrNull(serviceId)!==serviceId||!Number.isInteger(graceDays)||graceDays<0||graceDays>30)return {error:"Informe a tolerância em dias, de 0 a 30."};
 try{
  const denied=await checkModuleAction("publicidade","contratos_revisar");if(denied)return {error:denied};
  const session=createSupabaseServerClient();const {data:auth,error}=await session.auth.getUser();if(error||!auth.user)return {error:"Sessão inválida."};
  const {data:profile}=await session.from("profiles").select("role,active").eq("id",auth.user.id).maybeSingle();
  if(!profile?.active||profile.role!=="owner")return {error:"Operação reservada ao proprietário."};
  const {data:service,error:serviceError}=await session.from("commercial_contract_services").select("id,service_channel").eq("id",serviceId).maybeSingle();
  if(serviceError||service?.service_channel!=="led_panel")return {error:"Serviço não disponível."};
  const result=await createSupabaseAdminClient().rpc("altnix_assess_service_finance",{p_service:serviceId,p_grace_days:graceDays});
  const assessment=checkedFinancialAssessment(result.data);
  if(result.error||!assessment)return {error:"Não foi possível avaliar o financeiro deste serviço."};
  return {ok:true,assessment};
 }catch{return {error:"Avaliação financeira indisponível."};}
}
