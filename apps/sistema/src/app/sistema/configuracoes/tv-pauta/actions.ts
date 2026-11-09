"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "../../../../lib/supabase/server";

const DEST="/sistema/configuracoes/tv-pauta";

async function requireAdmin(){
  const db=createSupabaseServerClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw Error("Sessão inválida.");
  const {data:profile,error:profileError}=await db.from("profiles")
    .select("active,role").eq("id",user.id).maybeSingle();
  if(profileError||!profile?.active||!["owner","admin"].includes(profile.role))
    throw Error("Somente administração pode gerenciar TVs.");
  return db;
}

export async function approveTvAction(form:FormData):Promise<void>{
  const code=String(form.get("code")??"").trim();
  const name=String(form.get("name")??"").trim();
  if(!/^\d{6}$/.test(code)||name.length<2||name.length>60){
    redirect(DEST+"?erro=dados");
  }
  const db=await requireAdmin();
  const {data,error}=await db.rpc("tv_pauta_pair_approve",{
    p_code:code,p_name:name,
  });
  if(error||data!==true)redirect(DEST+"?erro=codigo");
  revalidatePath(DEST);
  redirect(DEST+"?resultado=autorizado");
}

export async function revokeTvAction(form:FormData):Promise<void>{
  const id=String(form.get("id")??"");
  if(!/^[0-9a-f-]{36}$/i.test(id))redirect(DEST+"?erro=dados");
  const db=await requireAdmin();
  const {data,error}=await db.rpc("tv_pauta_revoke",{p_id:id});
  if(error||data!==true)redirect(DEST+"?erro=revogar");
  revalidatePath(DEST);
  redirect(DEST+"?resultado=revogado");
}
