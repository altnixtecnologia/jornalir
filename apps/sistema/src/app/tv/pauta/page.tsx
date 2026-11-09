import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { loadAgendaWorkspaceData, normalizeAgendaDate } from "../../../features/agenda/agendaData";
import { PautaTvBoard } from "../../../features/pauta-tv/PautaTvBoard";
import { toTvPautaSnapshot } from "../../../features/pauta-tv/tvModel";

export const dynamic="force-dynamic";

function first(value:string|string[]|undefined):string|undefined {
  return Array.isArray(value)?value[0]:value;
}

/** Somente leitura, dados mínimos e sessão autenticada com permissão de pauta. */
export default async function PautaTvPage({
  searchParams,
}:{
  searchParams?:Promise<Record<string,string|string[]|undefined>>;
}):Promise<JSX.Element>{
  const db=createSupabaseServerClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)redirect("/login?erro=sessao");
  const date=normalizeAgendaDate(first((await searchParams)?.date));
  const data=await loadAgendaWorkspaceData(date);
  if(!data.access.pautaRead)redirect("/sistema?erro=sem-permissao");
  return <PautaTvBoard snapshot={toTvPautaSnapshot(data)}/>;
}
