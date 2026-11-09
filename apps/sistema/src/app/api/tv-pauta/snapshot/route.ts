import {NextResponse,type NextRequest} from "next/server";
import {readDeviceSnapshot} from "../../../../lib/tv-pauta/device";
import {normalizeAgendaDate} from "../../../../features/agenda/agendaData";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest):Promise<NextResponse>{
  const day=normalizeAgendaDate(request.nextUrl.searchParams.get("date")??undefined);
  const snapshot=await readDeviceSnapshot(day);
  return snapshot
    ?NextResponse.json(snapshot,{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}})
    :NextResponse.json({error:"Dispositivo não autorizado"},{status:401,headers:{"Cache-Control":"no-store"}});
}
