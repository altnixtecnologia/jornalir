import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isNativeFcmConfigured, sendFcmToAndroid } from "../../../../lib/notifications/firebaseCloudMessaging.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Claimed = { delivery_id: string; event_id: string; device_id: string };
type EventRow = { id: string; title: string; body: string; href: string | null; kind: string; app_kind: string; scheduled_at: string };
type DeviceRow = {
  id: string; fcm_token: string; enabled: boolean;
  ordinary_enabled: boolean; urgent_enabled: boolean;
  consented_at: string; last_seen_at: string;
};

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET ||
      request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // Trava antes de consultar ou reservar: jamais acionar FCM por deploy
  // acidental, pg_cron existente ou migration aplicada sem homologação.
  if (process.env.NATIVE_FCM_DELIVERY_ENABLED !== "true") {
    return NextResponse.json({ enabled: false, claimed: 0, acceptedByFcm: 0, failed: 0 });
  }
  if (!isNativeFcmConfigured()) {
    return NextResponse.json({ error: "Credenciais de envio FCM ausentes.", enabled: false }, { status: 503 });
  }
  let db: ReturnType<typeof database>;
  try { db = database(); }
  catch { return NextResponse.json({ error: "Banco não configurado." }, { status: 503 }); }

  const claim = await db.rpc("claim_native_push_deliveries", { p_limit: 10 });
  if (claim.error) {
    return NextResponse.json({ error: "Fila FCM indisponível; confira a migration nativa." }, { status: 503 });
  }
  const claims = (claim.data ?? []) as Claimed[];
  let acceptedByFcm = 0;
  let failed = 0;
  let expired = 0;
  let skipped = 0;

  // 10 envios por chamada. Falhas depois da reserva são 'uncertain' ou
  // 'failed', sem reenvio automático: FCM pode ter aceitado a mensagem.
  await Promise.all(claims.map(async (item) => {
    async function finish(status: "sent" | "failed" | "expired" | "uncertain", lastError?: string, fcmId?: string) {
      return db.from("native_push_deliveries").update({
        status, last_error: lastError?.slice(0, 180) ?? null,
        fcm_message_id: fcmId || null,
        completed_at: new Date().toISOString(),
      }).eq("id", item.delivery_id).eq("status", "sending");
    }

    try {
      const [eventQuery, deviceQuery] = await Promise.all([
        db.from("notification_events").select("id,title,body,href,kind,app_kind,scheduled_at").eq("id", item.event_id).maybeSingle(),
        db.from("native_push_devices").select("id,fcm_token,enabled,ordinary_enabled,urgent_enabled,consented_at,last_seen_at").eq("id", item.device_id).maybeSingle(),
      ]);
      if (eventQuery.error || deviceQuery.error || !eventQuery.data || !deviceQuery.data) {
        failed++;
        await finish("failed", "Evento ou aparelho indisponível");
        return;
      }
      const event = eventQuery.data as EventRow;
      const device = deviceQuery.data as DeviceRow;
      const now = Date.now();
      const scheduledAt = new Date(event.scheduled_at).getTime();
      const eligible = event.app_kind === "site" &&
        (event.kind === "ordinary" || event.kind === "urgent") &&
        device.enabled &&
        (event.kind === "urgent" ? device.urgent_enabled : device.ordinary_enabled) &&
        scheduledAt >= new Date(device.consented_at).getTime() &&
        scheduledAt <= now &&
        // A fila pode atrasar após o claim: não entregar eventos vencidos.
        scheduledAt >= now - 24 * 60 * 60 * 1000 &&
        new Date(device.last_seen_at).getTime() >= now - 60 * 24 * 60 * 60 * 1000 &&
        /^\/noticias\/[a-z0-9-]+\/?$/i.test(event.href || "");
      if (!eligible) {
        skipped++;
        await finish("expired", "Evento vencido, preferência desativada ou URL incompatível");
        return;
      }
      const result = await sendFcmToAndroid({
        token: device.fcm_token, eventId: event.id,
        kind: event.kind as "ordinary" | "urgent",
        title: event.title, body: event.body, href: event.href!,
      });
      if (result.ok) {
        acceptedByFcm++;
        await finish("sent", undefined, result.messageId);
      } else {
        failed++;
        if (result.expired) {
          expired++;
          await db.from("native_push_devices").update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("id", device.id);
        }
        await finish(result.expired ? "expired" : "failed", result.errorCode || "FCM " + result.status);
      }
    } catch {
      failed++;
      // HTTP pode ter chegado ao Google antes de ocorrer um timeout; não
      // presumir que o aparelho não recebeu e não reenviar automaticamente.
      await finish("uncertain", "Resultado FCM indeterminado; revisar manualmente");
    }
  }));

  return NextResponse.json({
    enabled: true, claimed: claims.length, acceptedByFcm, failed, expired, skipped,
    note: "Aceito pelo FCM não confirma exibição ou leitura no Android.",
  }, { headers: { "Cache-Control": "no-store" } });
}
