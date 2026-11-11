import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { planReminders, type ReminderSource } from "../../../../lib/notifications/nativeReminderPlan";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function json(data:object,status=200):NextResponse{
 return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});
}
function today():string{
 return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function addDays(day:string,amount:number):string{
 const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);
}

/** Apenas lembretes do proprio usuario autenticado: nunca retorna agenda da equipe inteira.
 * API aditiva, independente do Web Push e do envio publico FCM ja existentes.
 */
export async function GET():Promise<NextResponse>{
 try{
  const db=createSupabaseServerClient();
  const {data:identity,error:identityError}=await db.auth.getUser();
  const profileId=identity.user?.id;
  if(identityError||!profileId)return json({error:"Sessão necessária."},401);
  const [permission,active]=await Promise.all([
   db.rpc("has_staff_module_access",{p_module:"agenda",p_write:false}),
   db.rpc("is_active_staff"),
  ]);
  if(permission.error||active.error)return json({error:"Permissões indisponíveis."},503);
  if(permission.data!==true||active.data!==true)return json({error:"Sem acesso à Agenda."},403);
  const [assigned,invited,appointments]=await Promise.all([
   db.from("agenda_event_assignees").select("event_id")
    .eq("profile_id",profileId).eq("assignment_type","responsible")
    .is("completed_at",null).limit(300),
   db.from("agenda_event_invitees").select("event_id")
    .eq("profile_id",profileId).eq("status","accepted").limit(300),
   db.from("pauta_agenda_appointments").select("event_id")
    .eq("profile_id",profileId).limit(300),
  ]);
  if(assigned.error||invited.error||appointments.error)
   return json({error:"Consulta dos compromissos indisponível."},503);
  const ids=[...new Set([
   ...(assigned.data??[]).map(r=>r.event_id),
   ...(invited.data??[]).map(r=>r.event_id),
   ...(appointments.data??[]).map(r=>r.event_id),
  ])];
  if(!ids.length)return json({reminders:[],timezone:"America/Sao_Paulo"});
  const d=today();
  const events=await db.from("agenda_events")
   .select("id,title,event_date,start_time,reminder_minutes,updated_at,status,show_in_agenda")
   .in("id",ids).eq("status","scheduled").eq("show_in_agenda",true)
   .gte("event_date",d).lte("event_date",addDays(d,21))
   .order("event_date",{ascending:true}).limit(250);
  if(events.error)return json({error:"Não foi possível obter os lembretes."},503);
  const reminders=planReminders((events.data??[])
   .filter(row=>Boolean(row.start_time))
   .map(row=>({
    id:row.id,title:row.title,eventDate:row.event_date,
    startTime:row.start_time as string,
    reminderMinutes:row.reminder_minutes,updatedAt:row.updated_at,
   } satisfies ReminderSource)),profileId);
  return json({reminders,timezone:"America/Sao_Paulo"});
 }catch{return json({error:"Serviço de lembretes temporariamente indisponível."},503);}
}
