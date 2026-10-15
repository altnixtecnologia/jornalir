import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWebPush, type WebPushSubscription } from "../../../../lib/notifications/webPush.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TIMEZONE = "America/Sao_Paulo";
const MAX_SEND_PER_RUN = 20;

type AgendaEvent = { id: string; title: string; event_date: string; start_time: string | null; reminder_minutes: number | null };
type PushEvent = { id: string; app_kind: string; kind: string; title: string; body: string; href: string | null; target_profile_id: string | null; dedupe_key: string | null };
type PushDevice = { id: string; profile_id: string; subscription_endpoint: string; subscription_payload: unknown };
type PushPreference = { profile_id: string; ordinary_enabled: boolean; urgent_enabled: boolean; agenda_enabled: boolean };

function localNow(): string {
  const items = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = Object.fromEntries(items.map(({ type, value }) => [type, value]));
  return value.year + "-" + value.month + "-" + value.day + "T" + value.hour + ":" + value.minute;
}
function addMinutes(value: string, minutes: number): string {
  const d = new Date(value + ":00Z");
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}
function optedIn(kind: string, preference: PushPreference): boolean {
  if (kind === "agenda") return preference.agenda_enabled;
  if (kind === "urgent") return preference.urgent_enabled;
  return preference.ordinary_enabled;
}
function asSubscription(device: PushDevice): WebPushSubscription {
  const payload = device.subscription_payload as { keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!payload || typeof payload.keys?.p256dh !== "string" || typeof payload.keys?.auth !== "string") {
    throw new Error("Assinatura Web Push inválida");
  }
  return { endpoint: device.subscription_endpoint, keys: { p256dh: payload.keys.p256dh, auth: payload.keys.auth } };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!process.env.PUSH_VAPID_PUBLIC_KEY || !process.env.PUSH_VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: "Envio Web Push ainda não configurado" }, { status: 503 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Banco não configurado" }, { status: 503 });
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  const now = localNow();
  const date = now.slice(0, 10);
  const tomorrow = addMinutes(date + "T00:00", 1440).slice(0, 10);

  // Cria uma notificação específica para cada responsável, nunca um alerta
  // global com dados privados da Agenda.
  const { data: events, error: agendaError } = await db.from("agenda_events")
    .select("id,title,event_date,start_time,reminder_minutes")
    .eq("status", "scheduled")
    .gte("event_date", date).lte("event_date", tomorrow);
  if (agendaError) return NextResponse.json({ error: "Falha na consulta da Agenda" }, { status: 500 });

  let queued = 0;
  let failed = 0;
  for (const agenda of (events ?? []) as AgendaEvent[]) {
    if (!agenda.start_time || agenda.reminder_minutes === null) continue;
    const due = addMinutes(agenda.event_date + "T" + agenda.start_time.slice(0, 5), -agenda.reminder_minutes);
    if (due > now || addMinutes(due, 10) <= now) continue;
    const { data: assigned, error: assignedError } = await db.from("agenda_event_assignees")
      .select("profile_id").eq("event_id", agenda.id);
    if (assignedError) { failed++; continue; }
    for (const recipient of assigned ?? []) {
      const eventKey = ["agenda", agenda.id, due, recipient.profile_id].join(":");
      const { error } = await db.from("notification_events").upsert({
        app_kind: "sistema",
        kind: "agenda",
        target_profile_id: recipient.profile_id,
        title: "📅 " + agenda.title.slice(0, 110),
        body: "Compromisso: " + agenda.event_date.split("-").reverse().join("/") + " às " + agenda.start_time.slice(0, 5) + "h",
        href: "/sistema/agenda?date=" + encodeURIComponent(agenda.event_date),
        dedupe_key: eventKey,
        scheduled_at: new Date().toISOString(),
      }, { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (error) failed++;
      else queued++;
    }
  }

  // Eventos recentes primeiro para evitar que os anteriores já processados
  // bloqueiem a fila. O claim UNIQUE protege de execução concorrente.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pushEvents, error: queueError } = await db.from("notification_events")
    .select("id,app_kind,kind,title,body,href,target_profile_id,dedupe_key")
    .eq("app_kind", "sistema").lte("scheduled_at", new Date().toISOString())
    .gte("scheduled_at", since).order("scheduled_at", { ascending: false }).limit(80);
  if (queueError) return NextResponse.json({ error: "Falha na fila de notificações" }, { status: 500 });
  const { data: devices, error: deviceError } = await db.from("notification_devices")
    .select("id,profile_id,subscription_endpoint,subscription_payload")
    .eq("app_kind", "sistema").eq("enabled", true).limit(300);
  if (deviceError) return NextResponse.json({ error: "Falha no cadastro dos dispositivos" }, { status: 500 });
  const activeDevices = (devices ?? []) as PushDevice[];
  if (activeDevices.length === 0) return NextResponse.json({ queued, sent: 0, failed, devices: 0 });
  const profileIds = [...new Set(activeDevices.map((x) => x.profile_id))];
  const [preferenceResult, activeResult] = await Promise.all([
    db.from("notification_preferences")
      .select("profile_id,ordinary_enabled,urgent_enabled,agenda_enabled")
      .eq("app_kind", "sistema").in("profile_id", profileIds),
    db.from("profiles").select("id").eq("active", true).in("id", profileIds),
  ]);
  if (preferenceResult.error || activeResult.error) {
    return NextResponse.json({ error: "Falha ao verificar permissões" }, { status: 500 });
  }
  const preferences = new Map(((preferenceResult.data ?? []) as PushPreference[]).map((v) => [v.profile_id, v]));
  const activeProfiles = new Set((activeResult.data ?? []).map((v) => v.id));
  let sent = 0;
  let claimed = 0;
  outer: for (const event of (pushEvents ?? []) as PushEvent[]) {
    for (const device of activeDevices) {
      if (claimed >= MAX_SEND_PER_RUN) break outer;
      if (event.target_profile_id && event.target_profile_id !== device.profile_id) continue;
      if (!activeProfiles.has(device.profile_id)) continue;
      const pref = preferences.get(device.profile_id);
      if (!pref || !optedIn(event.kind, pref)) continue;
      const { error: claimError } = await db.from("notification_deliveries")
        .insert({ event_id: event.id, device_id: device.id, status: "pending", attempts: 1, last_attempt_at: new Date().toISOString() });
      if (claimError?.code === "23505") continue;
      if (claimError) { failed++; continue; }
      claimed++;
      try {
        const result = await sendWebPush(asSubscription(device), {
          title: event.title, body: event.body, kind: event.kind,
          href: event.href || "/sistema/notificacoes", tag: event.dedupe_key || event.id,
        });
        await db.from("notification_deliveries").update({
          status: result.ok ? "sent" : result.expired ? "expired" : "failed",
          last_error: result.ok ? null : "Web Push HTTP " + result.status,
        }).eq("event_id", event.id).eq("device_id", device.id);
        if (result.expired) {
          await db.from("notification_devices").update({ enabled: false }).eq("id", device.id);
        }
        if (result.ok) sent++;
        else failed++;
      } catch (error) {
        // Falha com resposta incerta não é repetida automaticamente.
        await db.from("notification_deliveries").update({
          status: "failed", last_error: error instanceof Error ? error.message.slice(0, 240) : "Falha desconhecida",
        }).eq("event_id", event.id).eq("device_id", device.id);
        failed++;
      }
    }
  }
  return NextResponse.json({ queued, claimed, sent, failed, devices: activeDevices.length });
}
