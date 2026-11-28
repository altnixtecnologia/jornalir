import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runDailyServiceFinance } from "../../../../lib/integrations/altnixServiceAuthorization";
import { readNotificationConfig } from "../../../../lib/notifications/whatsappTemplates";
import { runCustomerNotificationCycle } from "../../../../lib/notifications/notificationDispatcher";
import { whatsappSender } from "../../../../lib/notifications/providerSender";
import { isWhatsappCloudConfigured } from "../../../../lib/financeiro/whatsappCloudProvider";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
// Somente rotina de servidor autorizada. Sem parâmetros da UI ou dos players.
export async function GET(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 const incoming=request.headers.get("authorization");
 if(!secret||!incoming||incoming.length>1024)return NextResponse.json({error:"Não autorizado."},{status:401,headers});
 const expected=Buffer.from("Bearer "+secret),actual=Buffer.from(incoming);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:"Não autorizado."},{status:401,headers});
 const result=await runDailyServiceFinance(async(name,args)=>await createSupabaseAdminClient().rpc(name,args));
 // Notificações ao cliente reaproveitam esta MESMA rotina diária (sem novo cron). Primeiro as transições
 // financeiras são confirmadas; só então os avisos refletem o estado efetivo. Desligado por padrão
 // (ver readNotificationConfig) e uma falha aqui nunca altera o resultado financeiro.
 let notifications:unknown;
 try{
  const config=readNotificationConfig(process.env);
  if(config.enabled){
   const admin=createSupabaseAdminClient();
   notifications=await runCustomerNotificationCycle({
    rpc:async(name,args)=>await admin.rpc(name,args),
    send:whatsappSender,
    config,now:new Date(),providerConfigured:isWhatsappCloudConfigured(),
   });
  }
 }catch{notifications={status:"error",reason:"falha_no_ciclo_de_notificacoes"};}
 return NextResponse.json(notifications?{...result,notifications}:result,{status:result.status==="review"?503:200,headers});
}
