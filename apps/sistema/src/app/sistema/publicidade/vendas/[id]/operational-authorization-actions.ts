"use server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { ALTNIX_SERVICE_AUTH_RELEASED,parseServiceDecision,checkedServiceAuthorizationEvent,drainServiceAuthorizationOutbox } from "../../../../../lib/integrations/altnixServiceAuthorization";

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
    p_effective:new Date().toISOString(),p_reason:command.reason
  });
  if(error||!checkedServiceAuthorizationEvent(data,Date.now()))return {error:"Vínculo ou decisão não confirmado."};
  // A fila é persistida antes do envio. Falha de rede mantém a decisão.
  // Não confundir a confirmação de outros eventos do lote com a deste.
  try{await drainServiceAuthorizationOutbox(async(name,args)=>await admin.rpc(name,args));}catch{/* pendência permanece */}
  return {ok:true,queued:true,delivery:"pending"};
 }catch{return {error:"Autorização temporariamente indisponível."};}
}
