import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { isNfseArchiveEnabled, isNfseDeliveryEnabled, runNfseDeliveryBatch } from "../../../../lib/nfse/deliveryWorker";
import { archivePendingNfseNotes } from "../../../../lib/nfse/archiveNfseDocuments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Não configuramos o cron nem qualquer variável de envio nesta PR.
 * 1) Arquivamento no R2 das NFS-e autorizadas ainda sem documentos: independe do e-mail (basta R2 + liberação fiscal).
 * 2) Entrega por e-mail: só se o serviço de e-mail estiver configurado. Falha de e-mail NUNCA impede o arquivamento.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({error:"Não autorizado"},{status:401});
  }
  if (!isNfseArchiveEnabled()) {
    return NextResponse.json({error:"Entrega fiscal ainda desativada."},{status:503});
  }
  const admin = createSupabaseAdminClient();
  let archive: { archived: number; failed: number; pending: number } | { error: string };
  try { archive = await archivePendingNfseNotes(admin); }
  catch { archive = { error: "Falha ao arquivar documentos fiscais." }; }
  if (!isNfseDeliveryEnabled()) {
    return NextResponse.json({archive, processed: 0, outcomes: [], delivery: "e-mail fiscal não configurado"},{headers:{"Cache-Control":"no-store"}});
  }
  try {
    const result = await runNfseDeliveryBatch(admin);
    return NextResponse.json({archive, ...result},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({archive, error:"Falha ao processar fila de entrega fiscal."},{status:500});
  }
}
