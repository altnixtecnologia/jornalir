/** Planejamento de lembretes locais IR Controle, sem I/O.
 * Fonte da verdade: compromissos no servidor, em America/Sao_Paulo.
 */
export const REMINDER_TIMEZONE="America/Sao_Paulo";
const offsetFormat=new Intl.DateTimeFormat("en-US",{timeZone:REMINDER_TIMEZONE,timeZoneName:"shortOffset",hour:"2-digit"});
const verifyFormat=new Intl.DateTimeFormat("en-CA",{timeZone:REMINDER_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});

export function saoPauloInstant(day:string,time:string):Date|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}(?::\d{2})?$/.test(time))return null;
 const [y,m,d]=day.split("-").map(Number),[h,min]=time.split(":").map(Number);
 if(m<1||m>12||d<1||d>31||h>23||min>59)return null;
 const guess=Date.UTC(y,m-1,d,h,min);
 const valid=new Date(guess);
 if(valid.getUTCFullYear()!==y||valid.getUTCMonth()!==m-1||valid.getUTCDate()!==d)return null;
 const zone=offsetFormat.formatToParts(valid).find(p=>p.type==="timeZoneName")?.value;
 const match=/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(zone??"");
 if(!match)return null;
 const minutes=match[1]?(match[1]==="+"?1:-1)*(Number(match[2])*60+Number(match[3]??0)):0;
 const result=new Date(guess-minutes*60000);
 const values=Object.fromEntries(verifyFormat.formatToParts(result).map(p=>[p.type,p.value]));
 return [values.year,values.month,values.day].join("-")===day&&values.hour+":"+values.minute===time.slice(0,5)?result:null;
}
export interface ReminderSource{
 id:string;title:string;eventDate:string;startTime:string;reminderMinutes:number|null;updatedAt:string;
}
export interface PlannedReminder{
 id:number;eventId:string;title:string;fireAt:string;startsAt:string;updatedAt:string;href:string;
}
/** Um ID nativo estavel e positivo, com namespace separado do portal. */
export function reminderId(eventId:string,profileId:string,fireAt:string):number{
 const key="IR-CONTROLE|"+eventId+"|"+profileId+"|"+fireAt;
 let h=2166136261;
 for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);
 return ((h>>>0)%1999999999)+1;
}
export function planReminders(sources:ReminderSource[],profileId:string,nowMs=Date.now(),maxItems=48):PlannedReminder[]{
 const result:PlannedReminder[]=[];
 const seen=new Set<number>();
 for(const item of sources){
  const start=saoPauloInstant(item.eventDate,item.startTime);
  if(!start)continue;
  const minutes=item.reminderMinutes===null?15:Math.max(0,Math.min(10080,item.reminderMinutes));
  const fire=new Date(start.getTime()-minutes*60000);
  if(fire.getTime()<=nowMs+1000)continue;
  const id=reminderId(item.id,profileId,fire.toISOString());
  if(seen.has(id))continue;
  seen.add(id);
  result.push({
   id,eventId:item.id,title:item.title.slice(0,120),
   fireAt:fire.toISOString(),startsAt:start.toISOString(),updatedAt:item.updatedAt,
   href:"/sistema/agenda?date="+encodeURIComponent(item.eventDate),
  });
 }
 return result.sort((a,b)=>a.fireAt.localeCompare(b.fireAt)).slice(0,maxItems);
}
