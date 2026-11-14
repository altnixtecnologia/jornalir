import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NFSE_AVAILABLE_IN_THIS_RELEASE } from "../release/releasePolicy";
import { archiveNfseDocuments } from "./archiveNfseDocuments";
import { readNfseDocument } from "../../providers/r2/nfseDocuments.r2";
import { sendFiscalEmail, EmailOutcomeUncertainError, EmailRejectedByProviderError, isNfseEmailConfigured } from "./resendDelivery";
import { isNfseR2Configured } from "../../providers/r2/nfseDocuments.r2";
import { createIssuedNoteRepositorySupabase } from "../../providers/supabase/nfseIssuedNoteRepository.supabase";

interface QueueItem { id: string; issued_note_id: string; recipient_snapshot: string | null; }

/** Dependências externas injetáveis (testes com mocks, sem rede nem banco real); o padrão usa as implementações reais. */
export interface DeliveryWorkerDeps {
  isEnabled: () => boolean;
  getNote: (admin: SupabaseClient, id: string) => Promise<Awaited<ReturnType<ReturnType<typeof createIssuedNoteRepositorySupabase>["getById"]>>>;
  archive: typeof archiveNfseDocuments;
  read: typeof readNfseDocument;
  send: typeof sendFiscalEmail;
}
const defaultDeps: DeliveryWorkerDeps = {
  isEnabled: () => isNfseDeliveryEnabled(),
  getNote: (admin, id) => createIssuedNoteRepositorySupabase(admin).getById(id),
  archive: archiveNfseDocuments,
  read: readNfseDocument,
  send: sendFiscalEmail,
};

/** Arquivamento no R2 NÃO depende do e-mail: basta liberação fiscal em produção, flag de entrega e R2 configurado. */
export function isNfseArchiveEnabled(): boolean {
  return NFSE_AVAILABLE_IN_THIS_RELEASE &&
    process.env.VERCEL_ENV === "production" &&
    process.env.NFSE_DELIVERY_ENABLED === "true" &&
    isNfseR2Configured();
}
export function isNfseDeliveryEnabled(): boolean {
  // Entrega de NFS-e de PRODUCAO nao pode ser liberada só por env.
  return NFSE_AVAILABLE_IN_THIS_RELEASE &&
    process.env.VERCEL_ENV === "production" &&
    process.env.NFSE_DELIVERY_ENABLED === "true" &&
    isNfseEmailConfigured() && isNfseR2Configured();
}
async function settle(admin: SupabaseClient, id: string, payload: Record<string, unknown>): Promise<void> {
  const { data, error } = await admin.from("nfse_delivery_attempts")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status","processing").select("id").maybeSingle();
  if (error || !data) throw new Error("Não foi possível registrar estado da entrega.");
}
export async function runNfseDeliveryBatch(
  admin: SupabaseClient, deps: DeliveryWorkerDeps = defaultDeps,
): Promise<{ processed: number; outcomes: string[] }> {
  if (!deps.isEnabled()) throw new Error("Entrega fiscal desabilitada ou faltam credenciais privadas.");
  const { data: queued, error: listError } = await admin.from("nfse_delivery_attempts")
    .select("id,issued_note_id,recipient_snapshot")
    .eq("channel","email").eq("status","queued")
    .order("requested_at",{ascending:true}).limit(3);
  if (listError) throw new Error(listError.message);
  const outcomes: string[] = [];
  for (const row of (queued ?? []) as QueueItem[]) {
    const { data: claimed, error: claimError } = await admin.from("nfse_delivery_attempts")
      .update({status:"processing",processing_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq("id",row.id).eq("status","queued")
      .select("id").maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) continue;
    let startedProvider = false;
    try {
      const note = await deps.getNote(admin, row.issued_note_id);
      if (!note || note.environment !== "production" || !note.nfseXml || !note.accessKey) {
        throw new EmailRejectedByProviderError("NFS-e oficial não encontrada ou sem XML autorizado.");
      }
      const assets = await deps.archive(admin,note);
      if (!row.recipient_snapshot) {
        await settle(admin,row.id,{status:"missing_recipient",response_summary:"Cliente sem endereço fiscal na emissão."});
        outcomes.push("missing_recipient"); continue;
      }
      const [pdf,xml] = await Promise.all([
        deps.read(assets.danfse_pdf.r2_key,assets.danfse_pdf.sha256),
        deps.read(assets.nfse_xml.r2_key,assets.nfse_xml.sha256),
      ]);
      // Uma vez iniciado POST, qualquer falha de rede e ambigua:
      // nunca repetir automaticamente uma tentativa 'processing'.
      startedProvider = true;
      const sent = await deps.send({
        attemptId:row.id,to:row.recipient_snapshot,
        noteNumber: note.nfseNumber ?? note.dpsId,
        attachments: [
          {filename:`DANFSe-${note.nfseNumber ?? note.id}.pdf`,contentType:"application/pdf",bytes:pdf},
          {filename:`NFS-e-${note.nfseNumber ?? note.id}.xml`,contentType:"application/xml",bytes:xml},
        ],
      });
      await settle(admin,row.id,{
        status:"accepted",provider:"resend",provider_message_id:sent.providerMessageId,
        accepted_at:new Date().toISOString(),
        response_summary:"Provedor aceitou a mensagem; entrega ao destinatário ainda não confirmada.",
      });
      outcomes.push("accepted");
    } catch (error) {
      const status = error instanceof EmailRejectedByProviderError || !startedProvider ? "failed" : "uncertain";
      // Não incluir credenciais, XML ou resposta HTTP bruta no histórico.
      await settle(admin,row.id,{
        status,failed_at:new Date().toISOString(),
        response_summary: status === "uncertain"
          ? "Resultado de envio incerto. Verificar no provedor antes de reenviar."
          : error instanceof Error ? error.message.slice(0,260) : "Erro na preparação dos documentos.",
      });
      outcomes.push(status);
    }
  }
  return { processed: outcomes.length, outcomes };
}
