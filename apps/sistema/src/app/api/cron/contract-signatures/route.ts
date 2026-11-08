import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import {
  processSignatureDeliveryJob, signatureDeliveryEnabled, type SignatureDeliveryJob,
} from "../../../../lib/signatures/finalDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invocado SOMENTE por job autorizado (pg_cron/pg_net após homologação).
 * Não está agendado nesta etapa. WhatsApp de convite segue outro fluxo.
 * O status "uncertain" nunca é reenviado automaticamente.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!signatureDeliveryEnabled()) {
    return NextResponse.json({ enabled: false, processed: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const admin = createSupabaseAdminClient();
    // Se um processo anterior morreu após chamar o provedor, marcar como
    // incerto para revisão humana. Não presumir que não houve envio.
    const stale = await admin.rpc("mark_stale_contract_signature_deliveries");
    if (stale.error) throw new Error("Não foi possível conciliar entregas anteriores.");
    const claimed = await admin.rpc("claim_contract_signature_delivery", { p_limit: 4 });
    if (claimed.error) throw new Error("Não foi possível obter as notificações pendentes.");
    const rows = (claimed.data ?? []) as SignatureDeliveryJob[];
    const results = { sent: 0, failed: 0, uncertain: 0 };
    for (const job of rows) {
      try {
        const state = await processSignatureDeliveryJob(admin, job);
        results[state] += 1;
      } catch {
        // A entrega pode ter sido aceita pelo provedor. A tarefa permanece
        // "sending" e será marcada "uncertain" após timeout no próximo ciclo.
        results.uncertain += 1;
      }
    }
    return NextResponse.json({
      enabled: true, processed: rows.length, ...results,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Processamento de notificações temporariamente indisponível." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
