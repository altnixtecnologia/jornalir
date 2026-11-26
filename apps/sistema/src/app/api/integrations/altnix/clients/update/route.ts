import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { ALTNIX_CADASTRO_WRITE_RELEASED, parseCadastroWriteCommand } from "../../../../../../lib/integrations/altnixCadastroWriteContract";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function respond(payload:unknown,status=200){
 return NextResponse.json(payload,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
export async function POST(request:NextRequest){
 if(!ALTNIX_CADASTRO_WRITE_RELEASED||process.env.VERCEL_ENV!=="production"||process.env.ALTNIX_CLIENT_WRITE_ENABLED!=="true")return respond({error:"cadastro_write_disabled"},503);
 // Segredo de escrita distinto do segredo de exportação/leitura.
 const key=process.env.ALTNIX_CLIENT_WRITE_SECRET;
 const auth=request.headers.get("authorization")||"";
 if(!key||key.length<32||key.length>512||!auth.startsWith("Bearer ")||auth.length>519||!timingSafeEqual(createHash("sha256").update(auth.slice(7)).digest(),createHash("sha256").update(key).digest()))return respond({error:"unauthorized"},401);
 let raw:unknown;
 try{const body=await request.text();if(body.length>8192)return respond({error:"invalid_command"},400);raw=JSON.parse(body);}catch{return respond({error:"invalid_command"},400);}
 const command=parseCadastroWriteCommand(raw);
 if(!command)return respond({error:"invalid_command"},400);
 try{
  const db=createSupabaseAdminClient();
  const {data,error}=await db.rpc("apply_altnix_client_update",{
   p_operation_id:command.operationId,p_tenant_id:command.tenantId,p_advertiser_id:command.advertiserId,
   p_actor_id:command.actorId,p_client_id:command.canonicalClientId,p_expected_updated_at:command.expectedUpdatedAt,p_patch:command.patch
  });
  if(error){
   if(error.code==="42501")return respond({error:"permission_denied"},403);
   if(error.code==="40001"||error.code==="23505")return respond({error:"conflict"},409);
   if(error.code==="22023")return respond({error:"invalid_command"},400);
   console.error("Altnix cadastro write failed",error.code);
   return respond({error:"cadastro_unavailable"},503);
  }
  return respond({source:"jornalir",operationId:command.operationId,canonicalClientId:command.canonicalClientId,updatedAt:data});
 }catch{return respond({error:"cadastro_unavailable"},503);}
}
