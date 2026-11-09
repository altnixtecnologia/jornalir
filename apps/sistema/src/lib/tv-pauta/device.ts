import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "../supabase/server";
import type { TvPautaSnapshot } from "../../features/pauta-tv/tvModel";

export const TV_COOKIE="__Host-ir-tv-pauta";
export const TV_COOKIE_MAX_AGE=365*24*3600;

/** O valor do cookie jamais entra no JavaScript da televisão. */
export function tokenDigest(secret:string):string {
  return createHash("sha256").update(secret,"utf8").digest("hex");
}

export async function readDeviceSnapshot(day:string):Promise<TvPautaSnapshot|null>{
  const store=await cookies();
  const token=store.get(TV_COOKIE)?.value??"";
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const client=createSupabaseServerClient();
  const {data,error}=await client.rpc("tv_pauta_snapshot",{
    p_token_hash:tokenDigest(token),p_focus_date:day,
  });
  if(error){console.error("TV Pauta: falha na consulta de dispositivo",error.code);return null;}
  return data as TvPautaSnapshot|null;
}
