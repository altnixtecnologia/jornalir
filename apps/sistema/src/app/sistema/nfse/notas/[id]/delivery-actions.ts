"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { checkModuleAction } from "../../../../../lib/permissions/checkModuleAction";
import { NFSE_AVAILABLE_IN_THIS_RELEASE } from "../../../../../lib/release/releasePolicy";
import { isLocalPreviewEnabled } from "../../../../../lib/auth/localPreview";
import { fiscalRecipient, type NfseDeliveryEvent, type NfseDocumentAsset } from "../../../../../lib/nfse/deliveryPolicy";

type Result<T> = {ok:true;data:T} | {error:string};
type DbRow = {
  id:string;issued_note_id:string;channel:"email"|"whatsapp";origin:"automatic"|"manual";
  status:NfseDeliveryEvent["status"];recipient_snapshot:string|null;
  provider_message_id:string|null;requested_by:string|null;requested_at:string;
  accepted_at:string|null;delivered_at:string|null;failed_at:string|null;
  opened_at:string|null;confirmed_at:string|null;response_summary:string|null;
};
type AssetRow = {id:string;kind:NfseDocumentAsset["kind"];stored_at:string;size_bytes:number;sha256:string};
function asEvent(row:DbRow):NfseDeliveryEvent {
  return {
    id:row.id,issuedNoteId:row.issued_note_id,channel:row.channel,origin:row.origin,
    status:row.status,recipientSnapshot:row.recipient_snapshot??undefined,
    providerMessageId:row.provider_message_id??undefined,
    requestedBy:row.requested_by??undefined,requestedAt:row.requested_at,
    acceptedAt:row.accepted_at??undefined,deliveredAt:row.delivered_at??undefined,
    failedAt:row.failed_at??undefined,openedAt:row.opened_at??undefined,
    confirmedAt:row.confirmed_at??undefined,responseSummary:row.response_summary??undefined,
  };
}
async function verifiedAdmin() {
  const session = createSupabaseServerClient();
  const {data:user,error:authError} = await session.auth.getUser();
  if (authError || !user.user) throw new Error("Sessão inválida.");
  const {data:authorized,error} = await session.rpc("is_active_admin_or_owner");
  if (error || authorized !== true) throw new Error("Acesso ao histórico de entrega restrito aos administradores.");
  return {session,admin:createSupabaseAdminClient(),actorId:user.user.id};
}
export async function listNfseDeliveriesAction(noteId:string):Promise<Result<{events:NfseDeliveryEvent[];assets:NfseDocumentAsset[]}>> {
  const permissionError = await checkModuleAction("nfse","documentos_consultar");
  if (permissionError) return {error:permissionError};
  if (isLocalPreviewEnabled()) return {ok:true,data:{events:[],assets:[]}};
  try {
    const {admin} = await verifiedAdmin();
    const {data:note,error:noteError} = await admin.from("nfse_issued_notes").select("id").eq("id",noteId).maybeSingle();
    if (noteError || !note) return {error:"Nota não encontrada."};
    const [history,documents] = await Promise.all([
      admin.from("nfse_delivery_attempts")
        .select("id,issued_note_id,channel,origin,status,recipient_snapshot,provider_message_id,requested_by,requested_at,accepted_at,delivered_at,failed_at,opened_at,confirmed_at,response_summary")
        .eq("issued_note_id",noteId).order("requested_at",{ascending:false}).limit(100),
      admin.from("nfse_document_assets").select("id,kind,stored_at,size_bytes,sha256")
        .eq("issued_note_id",noteId).order("stored_at",{ascending:false}),
    ]);
    if (history.error || documents.error) throw new Error("Falha ao consultar entrega de documentos fiscais.");
    const rows = (history.data??[]) as DbRow[];
    const actorIds = [...new Set(rows.map((row)=>row.requested_by).filter((id):id is string=>Boolean(id)))];
    const actors = new Map<string,string>();
    if (actorIds.length) {
      const {data:profiles,error:profileError} = await admin.from("profiles")
        .select("id,name").in("id",actorIds);
      if (profileError) throw new Error("Falha ao localizar responsáveis pela entrega.");
      for (const item of profiles??[]) actors.set(item.id,item.name??"Operador");
    }
    return {ok:true,data:{
      events:rows.map(row=>({...asEvent(row),actorName:row.requested_by ? actors.get(row.requested_by) : undefined})),
      assets:((documents.data??[]) as AssetRow[]).map(x=>({
        id:x.id,kind:x.kind,storedAt:x.stored_at,sizeBytes:x.size_bytes,sha256:x.sha256,
      })),
    }};
  } catch (error) {
    return {error:error instanceof Error?error.message:"Falha ao consultar histórico."};
  }
}
/** Reenvio explícito, SEM reenviar a nota fiscal nem reciclar tentativa anterior. */
export async function queueNfseEmailResendAction(noteId:string):Promise<Result<{id:string}>> {
  if (!NFSE_AVAILABLE_IN_THIS_RELEASE || process.env.VERCEL_ENV !== "production" ||
      process.env.NFSE_DELIVERY_ENABLED !== "true") {
    return {error:"Reenvio fiscal ainda desativado, aguardando homologação e configuração de e-mail."};
  }
  const permissionError = await checkModuleAction("nfse","documentos_enviar");
  if (permissionError) return {error:permissionError};
  try {
    const {admin,actorId} = await verifiedAdmin();
    const {data:note,error:noteError} = await admin.from("nfse_issued_notes")
      .select("id,client_id,environment,access_key,nfse_xml").eq("id",noteId).maybeSingle();
    if (noteError || !note || note.environment !== "production" || !note.access_key || !note.nfse_xml) {
      return {error:"Nota fiscal de produção autorizada não encontrada."};
    }
    const {data:client,error:clientError} = await admin.from("clients")
      .select("fiscal_email,email").eq("id",note.client_id).maybeSingle();
    if (clientError || !client) return {error:"Cadastro do tomador não encontrado."};
    const recipient = fiscalRecipient({fiscalEmail:client.fiscal_email,email:client.email});
    if (!recipient) return {error:"Cadastre um e-mail fiscal ou principal válido antes de reenviar."};
    const {data:active,error:activeError} = await admin.from("nfse_delivery_attempts").select("id")
      .eq("issued_note_id",noteId).eq("channel","email").in("status",["queued","processing"]).limit(1);
    if (activeError) throw new Error(activeError.message);
    if (active?.length) return {error:"Já existe um e-mail aguardando envio ou em processamento."};
    const {data,error} = await admin.from("nfse_delivery_attempts").insert({
      issued_note_id:noteId,channel:"email",origin:"manual",status:"queued",
      recipient_snapshot:recipient,requested_by:actorId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    revalidatePath(`/sistema/nfse/notas/${noteId}`);
    return {ok:true,data:{id:data.id}};
  } catch (e) {return {error:e instanceof Error?e.message:"Falha ao solicitar reenvio."};}
}
/** WhatsApp Web abre a conversa; isto NAO comprova entrega ao cliente. */
export async function registerNfseWhatsAppOpenAction(noteId:string):Promise<Result<{id:string}>> {
  const permissionError = await checkModuleAction("nfse","documentos_enviar");
  if (permissionError) return {error:permissionError};
  if (isLocalPreviewEnabled()) return {error:"Demonstração local: nenhum compartilhamento é registrado."};
  try {
    const {admin,actorId} = await verifiedAdmin();
    const {data:note,error} = await admin.from("nfse_issued_notes").select("id")
      .eq("id",noteId).maybeSingle();
    if (error || !note) return {error:"NFS-e não encontrada."};
    const {data,error:insertError} = await admin.from("nfse_delivery_attempts").insert({
      issued_note_id:noteId,channel:"whatsapp",origin:"manual",status:"opened",
      requested_by:actorId,opened_at:new Date().toISOString(),
      response_summary:"WhatsApp aberto pelo operador. Não há confirmação automática de entrega.",
    }).select("id").single();
    if (insertError) throw new Error(insertError.message);
    revalidatePath(`/sistema/nfse/notas/${noteId}`);
    return {ok:true,data:{id:data.id}};
  } catch(e) {return {error:e instanceof Error?e.message:"Falha ao registrar abertura do WhatsApp."};}
}
export async function confirmNfseWhatsAppManualAction(id:string):Promise<Result<{id:string}>> {
  const permissionError = await checkModuleAction("nfse","documentos_enviar");
  if (permissionError) return {error:permissionError};
  if (isLocalPreviewEnabled()) return {error:"Demonstração local."};
  try {
    const {admin} = await verifiedAdmin();
    const {data,error} = await admin.from("nfse_delivery_attempts")
      .update({status:"operator_confirmed",confirmed_at:new Date().toISOString(),
        response_summary:"Operador declarou envio manual. Sem prova de entrega do WhatsApp."})
      .eq("id",id).eq("channel","whatsapp").eq("status","opened")
      .select("id,issued_note_id").maybeSingle();
    if (error || !data) return {error:"Compartilhamento não encontrado ou já confirmado."};
    revalidatePath(`/sistema/nfse/notas/${data.issued_note_id}`);
    return {ok:true,data:{id:data.id}};
  } catch(e) {return {error:e instanceof Error?e.message:"Falha ao confirmar."};}
}
