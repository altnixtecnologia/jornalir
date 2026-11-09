import {randomBytes} from "node:crypto";
import {NextResponse,type NextRequest} from "next/server";
import {createSupabaseServerClient} from "../../../../../lib/supabase/server";
import {tokenDigest,TV_COOKIE,TV_COOKIE_MAX_AGE} from "../../../../../lib/tv-pauta/device";

export const dynamic="force-dynamic";
export async function POST(request:NextRequest):Promise<NextResponse>{
  const origin=request.headers.get("origin");
  if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:"Origem inválida"},{status:403});
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:"Dados inválidos"},{status:400});}
  const input=body as {requestId?:unknown;proof?:unknown}|null;
  const requestId=input?.requestId,proof=input?.proof;
  if(typeof requestId!=="string"||!/^[0-9a-f-]{36}$/i.test(requestId)||
     typeof proof!=="string"||!/^[a-f0-9]{64}$/.test(proof))
    return NextResponse.json({error:"Dados inválidos"},{status:400});
  const token=randomBytes(32).toString("hex");
  const client=createSupabaseServerClient();
  const {data,error}=await client.rpc("tv_pauta_pair_claim",{
    p_id:requestId,p_claim_hash:tokenDigest(proof),p_device_hash:tokenDigest(token),
  });
  if(error){console.error("TV Pauta: falha ao concluir pareamento",error.code);}
  if(error||data!==true)return NextResponse.json({authorized:false},{
    headers:{"Cache-Control":"no-store"},
  });
  const response=NextResponse.json({authorized:true},{headers:{"Cache-Control":"no-store"}});
  response.cookies.set(TV_COOKIE,token,{
    path:"/",httpOnly:true,secure:true,sameSite:"strict",maxAge:TV_COOKIE_MAX_AGE,
  });
  return response;
}
