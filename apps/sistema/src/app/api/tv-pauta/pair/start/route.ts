import {randomBytes,randomInt,randomUUID} from "node:crypto";
import { NextResponse,type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { tokenDigest } from "../../../../../lib/tv-pauta/device";

export const dynamic="force-dynamic";
export async function POST(request:NextRequest):Promise<NextResponse>{
  const origin=request.headers.get("origin");
  if(origin && origin!==request.nextUrl.origin)return NextResponse.json({error:"Origem inválida"},{status:403});
  const client=createSupabaseServerClient();
  for(let attempt=0;attempt<3;attempt++){
    const requestId=randomUUID(),proof=randomBytes(32).toString("hex");
    const code=String(randomInt(100000,1000000));
    const {data,error}=await client.rpc("tv_pauta_pair_begin",{
      p_id:requestId,p_code:code,p_claim_hash:tokenDigest(proof),
    });
    if(error){console.error("TV Pauta: falha ao iniciar pareamento",error.code);break;}
    if(data===true)return NextResponse.json({requestId,proof,code,expiresInSeconds:600},{
      headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"},
    });
  }
  return NextResponse.json({error:"Não foi possível solicitar a autorização agora."},{
    status:429,headers:{"Cache-Control":"no-store"},
  });
}
