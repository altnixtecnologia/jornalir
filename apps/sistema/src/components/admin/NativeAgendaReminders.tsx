"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";

type Reminder={
 id:number;eventId:string;title:string;fireAt:string;startsAt:string;
 updatedAt:string;href:string;
};
const ORIGIN="ir-controle-agenda";
const CHANNEL="ir_controle_lembrete_ambos_v1";
const getMeta=(value:unknown):Record<string,unknown>|null=>
 value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
const safeHref=(value:unknown):value is string=>
 typeof value==="string"&&/^\/sistema\/agenda\?date=\d{4}-\d{2}-\d{2}$/.test(value);

/** Executa somente dentro do app nativo, nunca no navegador ou no portal.
 * Conserva os lembretes existentes se houver falha de rede.
 */
export function NativeAgendaReminders():JSX.Element|null{
 const {status,profile,localPreview}=useAuth();
 const router=useRouter();
 const [native,setNative]=useState(false);
 const [permission,setPermission]=useState<"unknown"|"granted"|"denied">("unknown");
 const [error,setError]=useState("");
 const syncing=useRef(false);
 useEffect(()=>{
  if(localPreview)return;
  let running=true;
  void import("@capacitor/core").then(({Capacitor})=>{
   if(running)setNative(Capacitor.isNativePlatform()&&["ios","android"].includes(Capacitor.getPlatform()));
  }).catch(()=>{});
  return()=>{running=false;};
 },[localPreview]);

 const sync=useCallback(async(profileId:string)=>{
  if(syncing.current)return;
  syncing.current=true;
  try{
   const {LocalNotifications}=await import("@capacitor/local-notifications");
   const allowed=await LocalNotifications.checkPermissions();
   if(allowed.display!=="granted"){setPermission("denied");return;}
   setPermission("granted");
   const response=await fetch("/api/mobile/agenda/reminders",{credentials:"include",cache:"no-store"});
   if(!response.ok){
    // A conta foi desativada ou perdeu acesso? Remova avisos confidenciais pendentes.
    if(response.status===401||response.status===403){
     const pending=await LocalNotifications.getPending();
     const ours=pending.notifications.filter(n=>getMeta(n.extra)?.irOrigin===ORIGIN);
     if(ours.length)await LocalNotifications.cancel({notifications:ours.map(n=>({id:n.id}))});
    }
    throw Error("Lembretes não sincronizados. Vamos tentar novamente.");
   }
   const body=await response.json() as {reminders?:Reminder[]};
   const reminders=Array.isArray(body.reminders)?body.reminders.slice(0,48):[];
   const wanted=new Map(reminders.map(x=>[x.id,x]));
   const pending=await LocalNotifications.getPending();
   const ours=pending.notifications.filter(n=>getMeta(n.extra)?.irOrigin===ORIGIN);
   const outdated=ours.filter(n=>{
    const current=wanted.get(n.id),meta=getMeta(n.extra);
    return !current||meta?.profileId!==profileId||
     meta?.fireAt!==current.fireAt||meta?.updatedAt!==current.updatedAt;
   });
   if(outdated.length)await LocalNotifications.cancel({notifications:outdated.map(n=>({id:n.id}))});
   const keep=new Set(ours.filter(n=>!outdated.includes(n)).map(n=>n.id));
   const incoming=reminders.filter(r=>!keep.has(r.id)&&Date.parse(r.fireAt)>Date.now()+1000);
   if(incoming.length)await LocalNotifications.schedule({notifications:incoming.map(r=>({
    id:r.id,title:"IR Controle — compromisso",
    body:r.title+" • "+new Intl.DateTimeFormat("pt-BR",{
     timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",
    }).format(new Date(r.startsAt))+"h",
    schedule:{at:new Date(r.fireAt),allowWhileIdle:true},
    channelId:CHANNEL,actionTypeId:"ir-controle-reminder",
    extra:{irOrigin:ORIGIN,profileId,eventId:r.eventId,
     updatedAt:r.updatedAt,fireAt:r.fireAt,href:r.href},
   }))});
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Falha de agendamento.");}
  finally{syncing.current=false;}
 },[]);

 useEffect(()=>{
  if(!native)return;
  let active=true;
  let remove:undefined|(()=>Promise<void>);
  void import("@capacitor/local-notifications").then(async({LocalNotifications})=>{
   await LocalNotifications.registerActionTypes({types:[{id:"ir-controle-reminder",
    actions:[{id:"snooze",title:"Lembrar em 5 min"}]}]});
   const listener=await LocalNotifications.addListener("localNotificationActionPerformed",async(action)=>{
    const meta=getMeta(action.notification.extra);
    if(meta?.irOrigin!==ORIGIN)return;
    if(action.actionId==="snooze"){
     const when=new Date(Date.now()+5*60000);
     await LocalNotifications.schedule({notifications:[{
      id:((Math.abs(action.notification.id*131+37)%1999999999)|0)+1,
      title:action.notification.title,body:action.notification.body,
      schedule:{at:when,allowWhileIdle:true},channelId:CHANNEL,
      extra:{...meta,fireAt:when.toISOString()},
     }]});
     return;
    }
    if(safeHref(meta.href))router.push(meta.href);
   });
   if(active)remove=()=>listener.remove();else await listener.remove();
  }).catch(()=>setError("Ações dos lembretes indisponíveis."));
  return()=>{active=false;if(remove)void remove();};
 },[native,router]);

 useEffect(()=>{
  if(!native)return;
  let active=true;
  if(status!=="authenticated"||!profile){
   void import("@capacitor/local-notifications").then(async({LocalNotifications})=>{
    const pending=await LocalNotifications.getPending();
    const ours=pending.notifications.filter(n=>getMeta(n.extra)?.irOrigin===ORIGIN);
    if(ours.length)await LocalNotifications.cancel({notifications:ours.map(n=>({id:n.id}))});
   }).catch(()=>{});
   return;
  }
  const id=profile.id;
  void sync(id);
  const refresh=()=>{if(active&&document.visibilityState==="visible")void sync(id);};
  window.addEventListener("focus",refresh);
  document.addEventListener("visibilitychange",refresh);
  const interval=window.setInterval(refresh,5*60000);
  return()=>{
   active=false;window.removeEventListener("focus",refresh);
   document.removeEventListener("visibilitychange",refresh);
   window.clearInterval(interval);
  };
 },[native,status,profile?.id,sync]);

 if(!native||status!=="authenticated"||!profile)return null;
 if(permission==="granted"&&!error)return null;
 return <aside aria-label="Lembretes do IR Controle" style={{
  position:"fixed",bottom:"calc(74px + env(safe-area-inset-bottom,0px))",
  left:12,right:12,zIndex:95,display:"flex",justifyContent:"center",pointerEvents:"none",
 }}>
  <div style={{pointerEvents:"auto",display:"flex",alignItems:"center",gap:8,
   padding:"9px 11px",borderRadius:11,background:"#f7faff",
   border:"1px solid #bed0e8",boxShadow:"0 4px 18px #0002",fontSize:12}}>
   <span>{error||"Ative os lembretes dos seus compromissos."}</span>
   <button type="button" style={{border:"1px solid #9aafce",borderRadius:7,padding:"6px 10px",
    background:"#fff",fontWeight:700,whiteSpace:"nowrap"}}
    onClick={async()=>{
     try{
      const {LocalNotifications}=await import("@capacitor/local-notifications");
      const result=await LocalNotifications.requestPermissions();
      setPermission(result.display==="granted"?"granted":"denied");
      if(result.display==="granted")await sync(profile.id);
     }catch{setError("Permissão não disponível neste aparelho.");}
    }}>{permission==="granted"?"Tentar novamente":"Ativar"}</button>
  </div>
 </aside>;
}
