import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { isNfseDeliveryEnabled, runNfseDeliveryBatch } from "../../../../lib/nfse/deliveryWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Não configuramos o cron nem qualquer variável de envio nesta PR. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({error:"Não autorizado"},{status:401});
  }
  if (!isNfseDeliveryEnabled()) {
    return NextResponse.json({error:"Entrega fiscal ainda desativada."},{status:503});
  }
  try {
    const result = await runNfseDeliveryBatch(createSupabaseAdminClient());
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Falha ao processar fila de entrega fiscal."},{status:500});
  }
}
