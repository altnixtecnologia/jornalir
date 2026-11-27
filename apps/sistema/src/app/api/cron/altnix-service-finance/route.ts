import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runDailyServiceFinance } from "../../../../lib/integrations/altnixServiceAuthorization";

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
 return NextResponse.json(result,{status:result.status==="review"?503:200,headers});
}
