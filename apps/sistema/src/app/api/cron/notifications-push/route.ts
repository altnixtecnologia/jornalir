import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isWebPushConfigured, sendWebPush } from "../../../../lib/notifications/webPushSender";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EventRow = {
  id: string;
  event_key: string;
  kind: "news" | "urgent" | "agenda" | "system";
  title: string;
  body: string;
  href: string;
  target_profile_id: string | null;
  due_at: string;
};
type SubscriptionRow = {
  id: string;
  enabled: boolean;
  profile_id: string | null;
  app_kind: "site" | "sistema";
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  news_opt_in: boolean;
  urgent_opt_in: boolean;
  agenda_opt_in: boolean;
};
type ClaimedRow = {
  event_id: string;
  subscription_id: string;
  status: string;
  attempts: number;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET
    || request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin || !isWebPushConfigured()) {
    return NextResponse.json({ error: "Processador Web Push não configurado." }, { status: 503 });
  }

  const [{ error: expireError }, { data: expanded, error: expandError }] = await Promise.all([
    admin.rpc("expire_uncertain_push_claims"),
    admin.rpc("expand_notification_outbox", { p_limit: 10 }),
  ]);
  if (expireError || expandError) {
    return NextResponse.json({ error: "Falha ao preparar notificações." }, { status: 500 });
  }
  const { data: claimed, error: claimError } = await admin.rpc("claim_notification_push_deliveries", { p_limit: 3 });
  if (claimError) return NextResponse.json({ error: "Falha ao reservar envios." }, { status: 500 });
  let sent = 0; let failed = 0; let gone = 0; let uncertain = 0;

  await Promise.all(((claimed ?? []) as ClaimedRow[]).map(async (claim) => {
    async function update(status: "sent" | "failed" | "gone" | "uncertain", error: string | null): Promise<void> {
      await admin.from("notification_push_deliveries")
        .update({
          status,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          last_error: error,
          processing_started_at: null,
        }).eq("event_id", claim.event_id).eq("subscription_id", claim.subscription_id);
    }
    try {
      const [eventResult, subscriptionResult] = await Promise.all([
        admin.from("notification_outbox").select("id,event_key,kind,title,body,href,target_profile_id,due_at")
          .eq("id", claim.event_id).maybeSingle(),
        admin.from("notification_push_subscriptions")
          .select("id,enabled,profile_id,app_kind,endpoint,p256dh,auth_secret,news_opt_in,urgent_opt_in,agenda_opt_in")
          .eq("id", claim.subscription_id).maybeSingle(),
      ]);
      const event = eventResult.data as EventRow | null;
      const subscription = subscriptionResult.data as SubscriptionRow | null;
      if (eventResult.error || subscriptionResult.error) throw new Error("Leitura incompleta");
      if (!event || !subscription || !subscription.enabled) {
        await update("gone", "Dispositivo desativado ou removido");
        gone++; return;
      }
      const isSite = subscription.app_kind === "site"
        && ((event.kind === "news" && subscription.news_opt_in)
          || (event.kind === "urgent" && subscription.urgent_opt_in));
      const isStaff = subscription.app_kind === "sistema"
        && !!event.target_profile_id && event.target_profile_id === subscription.profile_id
        && ((event.kind === "agenda" && subscription.agenda_opt_in) || event.kind === "system");
      if (!isSite && !isStaff) {
        await update("gone", "Sem consentimento ou destinatário mudou");
        gone++; return;
      }
      if (event.kind === "agenda") {
        // Conferir compromisso atual antes de enviar: uma edição, cancelamento
        // ou troca de responsáveis invalida lembretes antigos já enfileirados.
        const parts = event.event_key.split(":");
        const eventId = parts.length >= 4 ? parts[1] : null;
        const { data: valid, error: validateError } = await admin.rpc("is_valid_agenda_push_notification", {
          p_event_id: eventId,
          p_profile_id: subscription.profile_id,
          p_due_at: event.due_at,
        });
        if (validateError) throw new Error("Não foi possível validar compromisso");
        if (!valid) {
          await update("gone", "Compromisso ou responsável alterado");
          gone++; return;
        }
      }

      const result = await sendWebPush(subscription, {
        kind: event.kind,
        title: event.title,
        body: event.body,
        href: event.href,
        tag: event.event_key,
      });
      if (result.status === "sent") { await update("sent", null); sent++; }
      else if (result.status === "gone") {
        await update("gone", "HTTP " + result.httpStatus);
        await admin.from("notification_push_subscriptions").update({ enabled: false, last_error: "Push endpoint expired" }).eq("id", subscription.id);
        gone++;
      } else if (result.status === "failed") {
        await update("failed", "HTTP " + result.httpStatus);
        failed++;
      } else {
        await update("uncertain", result.message);
        uncertain++;
      }
    } catch (error) {
      // Uma exceção antes de chamar o provedor não envia nada. Como o ponto
      // exato da falha pode ser ambíguo, reprocessar manualmente, não às cegas.
      await update("uncertain", error instanceof Error ? error.message.slice(0,200) : "Falha inesperada");
      uncertain++;
    }
  }));
  return NextResponse.json({ expanded: expanded ?? 0, claimed: (claimed ?? []).length, sent, failed, gone, uncertain });
}
