import "server-only";
import {createHash,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {createSupabaseAdminClient} from "../../../../../../lib/supabase/admin";
import {ALTNIX_CADASTRO_CREATE_RELEASED,parseCadastroCreateCommand} from "../../../../../../lib/integrations/altnixCadastroCreateContract";
import {ALTNIX_CADASTRO_WRITE_RELEASED} from "../../../../../../lib/integrations/altnixCadastroWriteContract";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function respond(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
export async function POST(request:NextRequest){
 if(!ALTNIX_CADASTRO_CREATE_RELEASED||!ALTNIX_CADASTRO_WRITE_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.ALTNIX_CLIENT_WRITE_ENABLED!=="true")return respond({error:"cadastro_create_disabled"},503);
 const key=process.env.ALTNIX_CLIENT_WRITE_SECRET;
 const auth=request.headers.get("authorization")||"";
 if(!key||key.length<32||key.length>512||key===process.env.ALTNIX_CLIENT_SYNC_SECRET||!auth.startsWith("Bearer ")||auth.length>519||!timingSafeEqual(createHash("sha256").update(auth.slice(7)).digest(),createHash("sha256").update(key).digest()))return respond({error:"unauthorized"},401);
 let raw:unknown;
 try{const body=await request.text();if(body.length>8192)return respond({error:"invalid_command"},400);raw=JSON.parse(body);}catch{return respond({error:"invalid_command"},400);}
 const command=parseCadastroCreateCommand(raw);
 if(!command)return respond({error:"invalid_command"},400);
 try{
  const {data,error}=await createSupabaseAdminClient().rpc("apply_altnix_client_create",{p_operation_id:command.operationId,p_tenant_id:command.tenantId,p_advertiser_id:command.advertiserId,p_actor_id:command.actorId,p_client:command.client});
  if(error){
   if(error.code==="42501")return respond({error:"permission_denied"},403);
   if(error.code==="23505")return respond({error:"document_or_operation_conflict"},409);
   if(error.code==="22023")return respond({error:"invalid_command"},400);
   console.error("Altnix cadastro create failed",error.code);return respond({error:"cadastro_unavailable"},503);
  }
  return respond({source:"jornalir",operationId:command.operationId,canonicalClientId:data});
 }catch{return respond({error:"cadastro_unavailable"},503);}
}
