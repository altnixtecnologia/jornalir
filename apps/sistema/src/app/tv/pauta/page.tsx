import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "../../../lib/supabase/server";
import {loadAgendaWorkspaceData,normalizeAgendaDate} from "../../../features/agenda/agendaData";
import {PautaTvBoard} from "../../../features/pauta-tv/PautaTvBoard";
import {PairingTvClient} from "../../../features/pauta-tv/PairingTvClient";
import {toTvPautaSnapshot} from "../../../features/pauta-tv/tvModel";
import {readDeviceSnapshot,TV_COOKIE} from "../../../lib/tv-pauta/device";

export const dynamic="force-dynamic";

function first(value:string|string[]|undefined):string|undefined {
 return Array.isArray(value)?value[0]:value;
}

/** TV autorizada: só leitura da pauta. Não solicita login nem senha no aparelho. */
export default async function PautaTvPage({
 searchParams,
}:{
 searchParams?:Promise<Record<string,string|string[]|undefined>>;
}):Promise<JSX.Element>{
 const date=normalizeAgendaDate(first((await searchParams)?.date));
 // Primeiro o vínculo do dispositivo, independentemente do Supabase Auth.
 const token=cookies().get(TV_COOKIE)?.value;
 if(token){
   const snapshot=await readDeviceSnapshot(date);
   if(snapshot)return <PautaTvBoard snapshot={snapshot} deviceMode/>;
 }
 // Navegadores internos já autenticados mantêm a opção de visualização web.
 const db=createSupabaseServerClient();
 const {data:{user},error}=await db.auth.getUser();
 if(!error&&user){
   try{
     const data=await loadAgendaWorkspaceData(date);
     if(data.access.pautaRead)return <PautaTvBoard snapshot={toTvPautaSnapshot(data)}/>;
   }catch{/* Sem permissão de Pauta: não revelar registros. */}
 }
 // Primeira ativação: código temporário na TV, autorização no Sistema IR.
 // Nunca encaminhar a TV para a tela de login.
 return <PairingTvClient/>;
}
