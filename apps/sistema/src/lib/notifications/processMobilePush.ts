import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { sendMobileWebPush, vapidPublicKey } from "./webPush";

type AgendaEvent = { id: string; title: string; description: string|null;
  event_date: string; start_time: string|null; reminder_minutes: number|null; status: string };
type OutboxItem = { id:string; event_key:string; kind:"news"|"urgent"|"agenda"|"system";
  title:string; body:string; href:string; target_profile_id:string|null; attempts:number;
  created_at:string; };
type PushSubscriptionRow = { id:string; endpoint:string; p256dh:string; auth_secret:string; };
const TIMEZONE="America/Sao_Paulo";

function localTime(): string {
  const parts = new Intl.DateTimeFormat("sv-SE",{
    timeZone:TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  }).formatToParts(new Date());
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return map.year+"-"+map.month+"-"+map.day+"T"+map.hour+":"+map.minute;
}
function shiftMinutes(local:string,offset:number):string {
  const d=new Date(local+":00Z");d.setUTCMinutes(d.getUTCMinutes()+offset);
  return d.toISOString().slice(0,16);
}

async function enqueueAgendaPushReminders():Promise<number> {
  const admin=createSupabaseAdminClient();
  const now=localTime(),date=now.slice(0,10),tomorrow=shiftMinutes(date+"T00:00",1440).slice(0,10);
  const events=await admin.from("agenda_events")
    .select("id,title,description,event_date,start_time,reminder_minutes,status")
    .eq("status","scheduled").gte("event_date",date).lte("event_date",tomorrow);
  if(events.error)throw new Error("Agenda indisponível: "+events.error.message);
  let queued=0;
  for(const ev of (events.data??[]) as AgendaEvent[]){
    if(!ev.start_time||ev.reminder_minutes===null)continue;
    const when=shiftMinutes(ev.event_date+"T"+ev.start_time.slice(0,5),-ev.reminder_minutes);
    if(when>now||shiftMinutes(when,10)<=now)continue;
    const assignees=await admin.from("agenda_event_assignees").select("profile_id").eq("event_id",ev.id);
    if(assignees.error)throw new Error("Responsáveis indisponíveis");
    for(const row of assignees.data??[]){
      const key="agenda:"+ev.id+":"+when+":"+ev.reminder_minutes+":"+row.profile_id;
      const ins=await admin.from("notification_outbox").upsert({
        event_key:key,kind:"agenda",title:ev.title.slice(0,140),
        body:(ev.event_date.split("-").reverse().join("/")+" às "+ev.start_time.slice(0,5)+"h · "+(ev.description??"")).slice(0,300),
        href:"/sistema/agenda?date="+encodeURIComponent(ev.event_date),
        target_profile_id:row.profile_id,
      },{onConflict:"event_key",ignoreDuplicates:true});
      if(ins.error)throw new Error("Erro ao enfileirar compromisso");
      queued++;
    }
  }
  return queued;
}

export async function processMobilePushCron():Promise<{
  configured:boolean;queued:number;sent:number;failed:number;processed:number;
}> {
  const result={configured:Boolean(vapidPublicKey()),queued:0,sent:0,failed:0,processed:0};
  if(!result.configured)return result;
  const admin=createSupabaseAdminClient();
  result.queued=await enqueueAgendaPushReminders();
  const claimed=await admin.rpc("claim_notification_outbox",{p_limit:6});
  if(claimed.error)throw new Error("Fila de push indisponível: "+claimed.error.message);
  for(const item of (claimed.data??[]) as OutboxItem[]){
    const maximumAgeMinutes=item.kind==="agenda"?20:1440;
    if(Date.now()-new Date(item.created_at).getTime()>maximumAgeMinutes*60000){
      await admin.from("notification_outbox").update({
        status:"completed",processed_at:new Date().toISOString(),last_error:"Expirado sem disparo",
      }).eq("id",item.id);
      continue;
    }
    const batchResult=await admin.rpc("list_undelivered_mobile_subscriptions", {
      p_event_id:item.id,p_limit:6,
    });
    if(batchResult.error){
      await admin.from("notification_outbox").update({
        status:"failed",last_error:"Falha ao consultar aparelhos pendentes",
      }).eq("id",item.id);
      result.failed++;continue;
    }
    const batch=(batchResult.data??[]) as PushSubscriptionRow[];
    if(batch.length===0){
      await admin.from("notification_outbox").update({
        status:"completed",processed_at:new Date().toISOString(),last_error:null,
      }).eq("id",item.id);
      result.processed++;continue;
    }
    const failedBefore=result.failed;
    const outcomes=await Promise.all(batch.map(async (sub)=>{
      const prior=await admin.from("notification_push_deliveries")
        .select("attempts").eq("event_id",item.id).eq("subscription_id",sub.id).maybeSingle();
      if(prior.error)return {ok:false};
      const attempts=(prior.data?.attempts??0)+1;
      const claim=prior.data
        ? await admin.from("notification_push_deliveries")
          .update({status:"pending",attempts}).eq("event_id",item.id).eq("subscription_id",sub.id)
        : await admin.from("notification_push_deliveries")
          .insert({event_id:item.id,subscription_id:sub.id,status:"pending",attempts});
      if(claim.error)return {ok:false};
      const pushed=await sendMobileWebPush({endpoint:sub.endpoint,p256dh:sub.p256dh,auth_secret:sub.auth_secret},{
        title:item.title,body:item.body,href:item.href,kind:item.kind,eventKey:item.event_key,
      });
      const status=pushed.ok?"sent":pushed.status===404||pushed.status===410?"gone":
        pushed.status===0?"uncertain":"failed";
      await admin.from("notification_push_deliveries").update({
        status,last_error:pushed.ok?null:pushed.reason,
        sent_at:pushed.ok?new Date().toISOString():null,
      }).eq("event_id",item.id).eq("subscription_id",sub.id);
      if(status==="gone"){
        await admin.from("notification_push_subscriptions").update({enabled:false,last_error:"Push expirado"}).eq("id",sub.id);
      }else if(pushed.ok){
        await admin.from("notification_push_subscriptions").update({last_success_at:new Date().toISOString(),last_error:null}).eq("id",sub.id);
      }
      return {ok:pushed.ok};
    }));
    result.sent+=outcomes.filter(x=>x.ok).length;
    result.failed+=outcomes.filter(x=>!x.ok).length;
    const outstanding=await admin.rpc("list_undelivered_mobile_subscriptions",{
      p_event_id:item.id,p_limit:1,
    });
    if(outstanding.error)throw new Error("Falha ao verificar entregas restantes");
    const hasRemaining=(outstanding.data??[]).length>0;
    await admin.from("notification_outbox").update({
      status:hasRemaining?"pending":"completed",
      processed_at:hasRemaining?null:new Date().toISOString(),
      last_error:result.failed>failedBefore?"Há entregas com falha; consultar histórico":null,
    }).eq("id",item.id);
    result.processed++;
  }
  return result;
}
