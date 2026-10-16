import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { BirthdaysList } from "../../../features/aniversariantes/BirthdaysList";
import { LiveBirthdayTree } from "../../../features/aniversariantes/LiveBirthdayTree";
import { EditorialBirthdayPanel } from "../../../features/aniversariantes/EditorialBirthdayPanel";
import type { BirthdayEntry,BirthdayGroup } from "../../../features/aniversariantes/birthdayTypes";
import type { EditorialBirthdayRow,EditorialBirthdayMessage } from "../../../features/aniversariantes/editorialBirthdayTypes";
import type { BirthdayClientRow } from "../../../features/aniversariantes/ClientBirthdayDirectory";
import { brazilTodayISO, currentBirthdayWeekISO } from "../../../features/aniversariantes/birthdayWeek";
import { isLocalPreviewEnabled } from "../../../lib/auth/localPreview";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";
type ClientRow = {
  id:string;kind:string;status:string;
  full_name:string|null;company_name:string|null;trade_name:string|null;
  birth_date:string|null;address_city:string|null;
};
function makeGroups(clients:ClientRow[],records:EditorialBirthdayRow[]):BirthdayGroup[] {
  const groups:BirthdayGroup[]=[];
  const map=new Map<string,BirthdayGroup>();
  const masterEntries=new Map(records.filter(r=>r.source_client_id).map(r=>[r.source_client_id!,r]));
  for(const c of clients){
    const person=c.kind==="individual";
    const label=person?c.full_name||"Pessoa sem nome":c.trade_name||c.company_name||"Empresa sem nome";
    const saved=masterEntries.get(c.id);
    const principal:BirthdayEntry|undefined=person&&c.birth_date?{
      id:c.id,displayName:label,birthDate:c.birth_date,city:c.address_city||"",
      origin:"cadastro",active:true,publishInPrint:saved?.publish_in_print??false,
      notes:saved?.notes||undefined,profession:saved?.profession||undefined,
      organization:saved?.organization||undefined,knownAs:saved?.known_as||undefined,
      messageContext:saved?.message_context||undefined,
    }:undefined;
    const group:BirthdayGroup={
      id:c.id,kind:person?"individual":"company",label,city:c.address_city||"",
      principal,members:[],
    };
    groups.push(group);map.set(group.id,group);
  }
  for(const r of records) {
    if(r.source_client_id)continue;
    const member:BirthdayEntry={
      id:r.id,displayName:r.display_name,
      birthDate:`${r.birth_year??2000}-${String(r.birth_month).padStart(2,"0")}-${String(r.birth_day).padStart(2,"0")}`,
      city:r.city||"",relationship:r.relationship||undefined,
      origin:r.origin,active:r.active,publishInPrint:r.publish_in_print,
      notes:r.notes||undefined,profession:r.profession||undefined,
      organization:r.organization||undefined,knownAs:r.known_as||undefined,
      messageContext:r.message_context||undefined,
    };
    const group=r.group_client_id?map.get(r.group_client_id):null;
    if(group)group.members.push(member);
    else groups.push({
      id:"exception:"+r.id,kind:"individual",label:r.display_name,
      city:r.city||"",principal:member,members:[],
    });
  }
  return groups;
}

export default async function AniversariantesPage():Promise<JSX.Element>{
  if(isLocalPreviewEnabled())return <>
    <ModuleHeader eyebrow="ANIVERSARIANTES" title="Aniversariantes" description="Semana do Jornal e modelos de mensagens."/>
    <BirthdaysList localPreview />
  </>;
  const db=createSupabaseServerClient();
  const {data:auth,error:authError}=await db.auth.getUser();
  if(authError||!auth.user)redirect("/login");
  const {data:profile}=await db.from("profiles").select("role,active")
    .eq("id",auth.user.id).maybeSingle();
  if(!profile?.active)redirect("/login");
  if(profile.role==="operator"){
    const {data,error}=await db.rpc("staff_can_see_module",{p_module:"aniversariantes"});
    if(error||data!==true)redirect("/sistema?acesso=negado");
  }else if(profile.role!=="owner"&&profile.role!=="admin"){
    redirect("/sistema?acesso=negado");
  }
  const week=currentBirthdayWeekISO();
  const [clientResult,entryResult,messageResult]=await Promise.all([
    db.from("clients").select("id,kind,status,full_name,company_name,trade_name,birth_date,address_city")
      .eq("status","active").order("created_at",{ascending:false}),
    db.from("birthday_entries").select(
      "id,origin,source_client_id,group_client_id,display_name,birth_month,birth_day,birth_year,city,relationship,profession,organization,known_as,message_context,notes,active,publish_in_print"
    ).order("display_name"),
    db.from("birthday_edition_messages").select(
      "birthday_entry_id,edition_week_start,message,family,opening,ending"
    ).eq("edition_week_start",week),
  ]);
  const error=clientResult.error||entryResult.error||messageResult.error;
  const clients=(clientResult.data||[]) as ClientRow[];
  const entries=(entryResult.data||[]) as EditorialBirthdayRow[];
  const messages=(messageResult.data||[]) as EditorialBirthdayMessage[];
  const groups=makeGroups(clients,entries);
  const directory:BirthdayClientRow[]=clients.map(c=>({
    id:c.id,kind:c.kind==="company"?"company":"individual",
    name:c.kind==="company"?c.trade_name||c.company_name||"Empresa sem nome":c.full_name||"Pessoa sem nome",
    city:c.address_city||"",birthDate:c.kind==="individual"?c.birth_date:null,
  }));
  return <>
    <ModuleHeader eyebrow="ANIVERSARIANTES" title="Aniversariantes"
      description="Semana editorial, aniversários de clientes, instituições e casos excepcionais."/>
    {error?<p className="form-error" role="alert">Não foi possível carregar os registros de aniversário. Tente novamente.</p>:<>
      <LiveBirthdayTree groups={groups} messages={messages}
        initialWeekStart={week} todayISO={brazilTodayISO()}/>
      <details id="aniv-gerenciar" style={{marginTop:20}}>
        <summary style={{cursor:"pointer",padding:"12px 14px",fontWeight:700,
          border:"1px solid var(--line)",borderRadius:6}}>
          Gerenciar aniversariantes, vínculos e modelos de mensagens
        </summary>
        <div style={{marginTop:12}}>
          <EditorialBirthdayPanel clients={directory} entries={entries}
            initialMessages={messages} weekStart={week}/>
        </div>
      </details>
    </>}
  </>;
}
