import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, type WebPushSubscription } from "../../../../lib/notifications/webPush.server";
import {
  agendaInvitationStillPending,
  agendaReminderRecipients,
  buildAgendaInvitationNotification,
  currentAgendaReminderPush,
  type AgendaReminderMeeting,
  type AgendaInvitationMeeting,
  type AgendaInvitationRow,
} from "../../../../lib/notifications/agendaInvitationPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TIMEZONE = "America/Sao_Paulo";
const MAX_SEND_PER_RUN = 20;

type AgendaEvent = { id: string; title: string; event_date: string; start_time: string | null; end_time: string | null; reminder_minutes: number | null };
type PushEvent = { id: string; app_kind: string; kind: string; title: string; body: string; href: string | null; target_profile_id: string | null; dedupe_key: string | null; scheduled_at: string };
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


type SiteDelivery = { delivery_id: string; event_id: string; subscription_id: string };
type SiteSubscription = {
  id: string; endpoint: string; subscription_payload: unknown; enabled: boolean;
  ordinary_enabled: boolean; urgent_enabled: boolean; administrative_enabled: boolean;
};
function siteOptedIn(kind: string, subscriber: SiteSubscription): boolean {
  if (kind === "urgent") return subscriber.urgent_enabled;
  if (kind === "administrative") return subscriber.administrative_enabled;
  return subscriber.ordinary_enabled;
}

async function processSiteDeliveries(db: SupabaseClient): Promise<{ siteClaimed: number; siteSent: number; siteFailed: number }> {
  const { data, error } = await db.rpc("claim_site_push_deliveries", { p_limit: 20 });
  if (error) throw new Error("Não foi possível reservar entregas públicas: " + error.message);
  const claims = (data ?? []) as SiteDelivery[];
  let siteSent = 0;
  let siteFailed = 0;
  // As entregas são reservadas atomicamente no banco antes de qualquer envio.
  await Promise.all(claims.map(async (claim) => {
    try {
      const [eventResult, subscriberResult] = await Promise.all([
        db.from("notification_events").select("title,body,href,kind,dedupe_key").eq("id", claim.event_id).maybeSingle(),
        db.from("site_push_subscriptions").select("id,endpoint,subscription_payload,enabled,ordinary_enabled,urgent_enabled,administrative_enabled").eq("id", claim.subscription_id).maybeSingle(),
      ]);
      const event = eventResult.data;
      const subscriber = subscriberResult.data as SiteSubscription | null;
      if (eventResult.error || subscriberResult.error || !event || !subscriber) throw new Error("Evento ou assinatura indisponível");
      if (!subscriber.enabled || !siteOptedIn(event.kind, subscriber)) {
        await db.from("site_push_deliveries").update({ status: "expired", last_error: "Preferência desativada" }).eq("id", claim.delivery_id);
        return;
      }
      const push = subscriber.subscription_payload as { keys?: { p256dh?: string; auth?: string } } | null;
      if (!push?.keys?.p256dh || !push?.keys?.auth) throw new Error("Chaves da assinatura ausentes");
      const sent = await sendWebPush({ endpoint: subscriber.endpoint, keys: { p256dh: push.keys.p256dh, auth: push.keys.auth } }, {
        title: event.title, body: event.body, kind: event.kind,
        href: event.href || "/", tag: event.dedupe_key || claim.event_id,
      });
      const nextStatus = sent.ok ? "sent" : sent.expired ? "expired" : "failed";
      await db.from("site_push_deliveries").update({
        status: nextStatus,
        last_error: sent.ok ? null : "Web Push HTTP " + sent.status,
      }).eq("id", claim.delivery_id);
      if (sent.expired) {
        await db.from("site_push_subscriptions").update({ enabled: false }).eq("id", claim.subscription_id);
      }
      if (sent.ok) siteSent++;
      else siteFailed++;
    } catch (error) {
      siteFailed++;
      await db.from("site_push_deliveries").update({
        status: "failed",
        last_error: error instanceof Error ? error.message.slice(0, 240) : "Falha na entrega",
      }).eq("id", claim.delivery_id);
      // Status desconhecido não é repetido automaticamente para evitar duplicidade.
    }
  }));
  return { siteClaimed: claims.length, siteSent, siteFailed };
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
  const yesterday = addMinutes(date + "T00:00", -1440).slice(0,10);
  const { data: events, error: agendaError } = await db.from("agenda_events")
    .select("id,title,event_date,start_time,end_time,reminder_minutes")
    .eq("status", "scheduled")
    .gte("event_date", yesterday).lte("event_date", tomorrow);
  if (agendaError) return NextResponse.json({ error: "Falha na consulta da Agenda" }, { status: 500 });

  let queued = 0;
  let overdueQueued = 0;
  let failed = 0;
  for (const agenda of (events ?? []) as AgendaEvent[]) {
    const dateTime = agenda.event_date + "T" + (agenda.start_time?.slice(0,5) || "00:00");
    const reminderAt = agenda.start_time && agenda.reminder_minutes !== null
      ? addMinutes(dateTime, -agenda.reminder_minutes) : null;

    // Sem fim: tolerância de 15 min após o início. Com fim: 10 min após
    // o encerramento. Sem horário: 08:00h do dia seguinte, não à meia-noite.
    const overdueAt = agenda.end_time
      ? addMinutes(agenda.event_date + "T" + agenda.end_time.slice(0,5),10)
      : agenda.start_time ? addMinutes(dateTime,15)
      : addMinutes(agenda.event_date + "T08:00",1440);
    const isReminderDue = reminderAt !== null && reminderAt <= now
      && addMinutes(reminderAt,10) > now;
    // Janela de 60 min impede reenvio de todo o acervo vencido após deploy.
    const isOverdueDue = overdueAt <= now && addMinutes(overdueAt,60) > now;
    if (!isReminderDue && !isOverdueDue) continue;

    const { data: assigned, error: assignedError } = await db.from("agenda_event_assignees")
      .select("profile_id,completed_at").eq("event_id", agenda.id)
      .eq("assignment_type","responsible");
    if (assignedError) { failed++; continue; }
    // Reuniões: quem confirmou a presença também recebe o lembrete
    // individual. Somente responsáveis recebem alerta de tarefa atrasada.
    let acceptedGuests: Array<{ profile_id: string }> = [];
    if (isReminderDue) {
      const invited = await db.from("agenda_event_invitees")
        .select("profile_id").eq("event_id", agenda.id).eq("status", "accepted");
      if (invited.error) { failed++; continue; }
      acceptedGuests = invited.data ?? [];
    }
    const recipients = agendaReminderRecipients(assigned ?? [], acceptedGuests);
    for (const recipient of recipients) {
      if (recipient.completed_at) continue; // Responsável já concluiu.
      for (const category of (["reminder","overdue"] as const)) {
        if (category === "reminder" && !isReminderDue) continue;
        if (category === "overdue" && (!isOverdueDue || recipient.meetingOnly)) continue;
        const timeKey = category === "overdue" ? overdueAt : reminderAt!;
        const eventKey = ["agenda",category,agenda.id,timeKey,recipient.profile_id].join(":");
        const { error } = await db.from("notification_events").upsert({
          app_kind: "sistema",
          kind: "agenda",
          target_profile_id: recipient.profile_id,
          title: (category === "overdue" ? "⚠ Compromisso atrasado: " : "📅 ")
            + agenda.title.slice(0,105),
          body: category === "overdue"
            ? "O prazo terminou. Abra a Agenda para concluir ou reagendar."
            : "Compromisso: " + agenda.event_date.split("-").reverse().join("/")
              + " às " + agenda.start_time?.slice(0,5) + "h",
          href: "/sistema/agenda?date=" + encodeURIComponent(agenda.event_date),
          dedupe_key: eventKey,
          scheduled_at: new Date().toISOString(),
        }, { onConflict: "dedupe_key", ignoreDuplicates: true });
        if (error) failed++;
        else if (category === "overdue") overdueQueued++;
        else queued++;
      }
    }
  }

  // O convite é privado: gerar uma notificação para cada pessoa convidada,
  // nunca notificar o grupo todo. Lotes antigos não são disparados depois
  // de um período de indisponibilidade do cron.
  const invitationSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: inviteRows, error: inviteError } = await db.from("agenda_event_invitees")
    .select("event_id,profile_id,invited_at,status")
    .eq("status", "pending").gte("invited_at", invitationSince)
    .order("invited_at", { ascending: false }).limit(200);
  if (inviteError) return NextResponse.json({ error: "Falha ao consultar convites da Agenda" }, { status: 500 });
  const invitations = (inviteRows ?? []) as AgendaInvitationRow[];
  let invitationsQueued = 0;
  if (invitations.length) {
    const meetingIds = [...new Set(invitations.map((i) => i.event_id))];
    const invitedIds = [...new Set(invitations.map((i) => i.profile_id))];
    const [meetingsResult, profilesResult, staffResult] = await Promise.all([
      db.from("agenda_events").select("id,title,event_date,start_time,status,event_kind")
        .in("id", meetingIds).eq("status", "scheduled").eq("event_kind", "general"),
      db.from("profiles").select("id").in("id", invitedIds).eq("active", true),
      db.from("staff_memberships").select("profile_id").in("profile_id", invitedIds),
    ]);
    if (meetingsResult.error || profilesResult.error || staffResult.error) {
      return NextResponse.json({ error: "Falha ao validar destinatários dos convites" }, { status: 500 });
    }
    const meetings = new Map(((meetingsResult.data ?? []) as AgendaInvitationMeeting[]).map((m) => [m.id, m]));
    const profiles = new Set((profilesResult.data ?? []).map((p) => p.id));
    const staff = new Set((staffResult.data ?? []).map((p) => p.profile_id));
    const nowIso = new Date().toISOString();
    for (const invite of invitations) {
      if (!profiles.has(invite.profile_id) || !staff.has(invite.profile_id)) continue;
      const notification = buildAgendaInvitationNotification(invite, meetings.get(invite.event_id), nowIso, localNow());
      if (!notification) continue;
      // UNIQUE(dedupe_key) evita novos avisos ao repetir o cron.
      const result = await db.from("notification_events").upsert(notification, {
        onConflict: "dedupe_key", ignoreDuplicates: true,
      }).select("id");
      if (result.error) failed++;
      else invitationsQueued += result.data?.length ?? 0;
    }
  }

  // Eventos recentes primeiro para evitar que os anteriores já processados
  // bloqueiem a fila. O claim UNIQUE protege de execução concorrente.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pushEvents, error: queueError } = await db.from("notification_events")
    .select("id,app_kind,kind,title,body,href,target_profile_id,dedupe_key,scheduled_at")
    .eq("app_kind", "sistema").lte("scheduled_at", new Date().toISOString())
    .gte("scheduled_at", since).order("scheduled_at", { ascending: false }).limit(80);
  if (queueError) return NextResponse.json({ error: "Falha na fila de notificações" }, { status: 500 });
  const { data: devices, error: deviceError } = await db.from("notification_devices")
    .select("id,profile_id,subscription_endpoint,subscription_payload")
    .eq("app_kind", "sistema").eq("enabled", true).limit(300);
  if (deviceError) return NextResponse.json({ error: "Falha no cadastro dos dispositivos" }, { status: 500 });
  const activeDevices = (devices ?? []) as PushDevice[];
  if (activeDevices.length === 0) {
    const site = await processSiteDeliveries(db);
    return NextResponse.json({ queued, overdueQueued, invitationsQueued, sent: 0, failed, devices: 0, ...site });
  }
  const profileIds = [...new Set(activeDevices.map((x) => x.profile_id))];
  const [preferenceResult, activeResult, staffResult] = await Promise.all([
    db.from("notification_preferences")
      .select("profile_id,ordinary_enabled,urgent_enabled,agenda_enabled")
      .eq("app_kind", "sistema").in("profile_id", profileIds),
    db.from("profiles").select("id").eq("active", true).in("id", profileIds),
    db.from("staff_memberships").select("profile_id").in("profile_id", profileIds),
  ]);
  if (preferenceResult.error || activeResult.error || staffResult.error) {
    return NextResponse.json({ error: "Falha ao verificar permissões" }, { status: 500 });
  }
  const preferences = new Map(((preferenceResult.data ?? []) as PushPreference[]).map((v) => [v.profile_id, v]));
  const staffIds = new Set((staffResult.data ?? []).map((v) => v.profile_id));
  const activeProfiles = new Set((activeResult.data ?? []).filter((v) => staffIds.has(v.id)).map((v) => v.id));
  let sent = 0;
  let claimed = 0;
  outer: for (const event of (pushEvents ?? []) as PushEvent[]) {
    const ageMs = Date.now() - new Date(event.scheduled_at).getTime();
    if (event.kind === "agenda" && ageMs > 10 * 60 * 1000) continue;
    if (event.kind === "urgent" && ageMs > 60 * 60 * 1000) continue;
    for (const device of activeDevices) {
      if (claimed >= MAX_SEND_PER_RUN) break outer;
      // Evento privado sem destinatário jamais vira envio para todos.
      if (event.target_profile_id !== device.profile_id) continue;
      if (!activeProfiles.has(device.profile_id)) continue;
      const pref = preferences.get(device.profile_id);
      if (!pref || !optedIn(event.kind, pref)) continue;
      let pushTitle = event.title;
      let pushBody = event.body;
      let pushHref = event.href || "/sistema/notificacoes";
      // Entre a formação da fila e a entrega, o convidado pode ter aceitado,
      // recusado ou perdido o convite. Validar novamente antes do envio.
      if (event.dedupe_key?.startsWith("agenda:invite:")) {
        const parts = /^agenda:invite:([0-9a-f-]{36}):([0-9a-f-]{36}):(.+)$/i.exec(event.dedupe_key);
        if (!parts || parts[2] !== device.profile_id) continue;
        const [invitation, meeting, confirmed] = await Promise.all([
          db.from("agenda_event_invitees").select("status,invited_at")
            .eq("event_id", parts[1]).eq("profile_id", device.profile_id).maybeSingle(),
          db.from("agenda_events").select("id,title,status,event_kind,event_date,start_time")
            .eq("id", parts[1]).maybeSingle(),
          db.auth.admin.getUserById(device.profile_id),
        ]);
        if (invitation.error || meeting.error || confirmed.error) { failed++; continue; }
        if (!confirmed.data?.user?.email_confirmed_at ||
            !agendaInvitationStillPending(event.dedupe_key, device.profile_id, invitation.data, meeting.data)) continue;
        // A data, o horário e o título podem ter sido alterados pelo
        // organizador. Nunca enviar o texto antigo nem reunião vencida.
        const currentInvite = buildAgendaInvitationNotification({
          event_id: parts[1], profile_id: device.profile_id,
          invited_at: invitation.data!.invited_at, status: invitation.data!.status,
        }, meeting.data as AgendaInvitationMeeting, new Date().toISOString(), localNow());
        if (!currentInvite) continue;
        pushTitle = currentInvite.title;
        pushBody = currentInvite.body;
        pushHref = currentInvite.href;
      }
      if (event.kind === "agenda" &&
          /^agenda:(reminder|overdue):/.test(event.dedupe_key || "")) {
        const match = /^agenda:(reminder|overdue):([0-9a-f-]{36}):/.exec(event.dedupe_key || "");
        if (!match) continue;
        const [meetingResult, assignmentResult, inviteResult] = await Promise.all([
          db.from("agenda_events")
            .select("title,event_date,start_time,end_time,reminder_minutes,status,event_kind")
            .eq("id", match[2]).maybeSingle(),
          db.from("agenda_event_assignees")
            .select("completed_at").eq("event_id", match[2])
            .eq("profile_id", device.profile_id).eq("assignment_type", "responsible").maybeSingle(),
          db.from("agenda_event_invitees")
            .select("status").eq("event_id", match[2])
            .eq("profile_id", device.profile_id).maybeSingle(),
        ]);
        if (meetingResult.error || assignmentResult.error || inviteResult.error) {
          failed++;
          continue;
        }
        const current = currentAgendaReminderPush(
          event.dedupe_key!, device.profile_id,
          meetingResult.data as AgendaReminderMeeting | null,
          assignmentResult.data, inviteResult.data?.status ?? null, localNow(),
        );
        if (!current) continue;
        pushTitle = current.title;
        pushBody = current.body;
        pushHref = current.href;
      }
      const { error: claimError } = await db.from("notification_deliveries")
        .insert({ event_id: event.id, device_id: device.id, status: "pending", attempts: 1, last_attempt_at: new Date().toISOString() });
      if (claimError?.code === "23505") continue;
      if (claimError) { failed++; continue; }
      claimed++;
      try {
        const result = await sendWebPush(asSubscription(device), {
          title: pushTitle, body: pushBody, kind: event.kind,
          href: pushHref, tag: event.dedupe_key || event.id,
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
  const site = await processSiteDeliveries(db);
  return NextResponse.json({ queued, overdueQueued, invitationsQueued, claimed, sent, failed, devices: activeDevices.length, ...site });
}
