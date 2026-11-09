/** Regras puras das notificações de cobertura — horários de São Paulo, sem reenvio retroativo. */
export type CoverageEventReminder = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  status: string;
  show_in_agenda?: boolean;
};
export type CoverageStateReminder = {
  event_id: string;
  attendance_owner_id: string;
  attendance_status: string;
  audible_minutes: number;
  checkin_minutes: number;
  article_status: string;
  revision: number;
};
export type CoverageReminderType = "reminder" | "checkin";

export function shiftCoverageLocalMinute(value:string, delta:number):string{
  const date=new Date(value+":00Z");
  date.setUTCMinutes(date.getUTCMinutes()+delta);
  return date.toISOString().slice(0,16);
}
export function coverageReminderDue(event:CoverageEventReminder, state:CoverageStateReminder, kind:CoverageReminderType):string|null{
  if(event.status!=="scheduled"||!event.start_time||!event.event_date)return null;
  if(kind==="checkin" && (state.attendance_status==="present"||state.attendance_status==="absent"))return null;
  const delta=kind==="reminder"?state.audible_minutes:state.checkin_minutes;
  return shiftCoverageLocalMinute(event.event_date+"T"+event.start_time.slice(0,5),-delta);
}
export function coverageNotification(
  event:CoverageEventReminder,state:CoverageStateReminder,kind:CoverageReminderType,
  nowLocal:string,nowIso:string,
):{app_kind:"sistema";kind:"agenda";target_profile_id:string;title:string;body:string;href:string;dedupe_key:string;scheduled_at:string}|null{
  const due=coverageReminderDue(event,state,kind);
  if(!due||due>nowLocal||shiftCoverageLocalMinute(due,10)<=nowLocal)return null;
  const eventKey=["coverage",kind,event.id,due,state.attendance_owner_id,state.revision].join(":");
  return {
    app_kind:"sistema",kind:"agenda",target_profile_id:state.attendance_owner_id,
    title:kind==="reminder"?"🔔 Cobertura em breve: "+event.title.slice(0,105):
      "📍 Você já chegou? "+event.title.slice(0,105),
    body:kind==="reminder"
      ?"Você é responsável pela cobertura às "+event.start_time!.slice(0,5)+"h. Confira o compromisso."
      :"Confirme se compareceu, ainda está a caminho ou não poderá comparecer. A matéria continua pendente.",
    href:(event.show_in_agenda===false?"/sistema/pauta":"/sistema/agenda")+"?date="+encodeURIComponent(event.event_date),
    dedupe_key:eventKey,
    scheduled_at:nowIso,
  };
}
export function currentCoverageNotification(
  key:string,recipient:string,event:CoverageEventReminder|null,
  coverage:CoverageStateReminder|null,nowLocal:string,
):{title:string;body:string;href:string;silent:boolean}|null{
  const match=/^coverage:(reminder|checkin):([a-f0-9-]{36}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):([a-f0-9-]{36}):(\d+)$/i.exec(key);
  if(!match||!event||!coverage||match[2]!==event.id||match[2]!==coverage.event_id||
     match[4]!==recipient||coverage.attendance_owner_id!==recipient||
     coverage.revision!==Number(match[5]))return null;
  const kind=match[1] as CoverageReminderType;
  const due=coverageReminderDue(event,coverage,kind);
  if(!due||due!==match[3]||due>nowLocal||shiftCoverageLocalMinute(due,10)<=nowLocal)return null;
  return {
    title:kind==="reminder"?"🔔 Cobertura em breve: "+event.title.slice(0,105):
      "📍 Você já chegou? "+event.title.slice(0,105),
    body:kind==="reminder"?"Você é responsável pela cobertura às "+event.start_time!.slice(0,5)+"h. Confira o compromisso.":
      "Confirme sua chegada na Agenda. A matéria continuará pendente até ser concluída.",
    href:(event.show_in_agenda===false?"/sistema/pauta":"/sistema/agenda")+"?date="+encodeURIComponent(event.event_date),
    silent:kind==="checkin",
  };
}
