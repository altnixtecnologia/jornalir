import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AgendaRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string;
  start_time: string | null;
  reminder_minutes: number | null;
};
const TZ = "America/Sao_Paulo";

function nowLocal(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return map.year + "-" + map.month + "-" + map.day + "T" + map.hour + ":" + map.minute;
}

function atMinute(local: string, difference: number): string {
  // A conta em UTC serve apenas para somar minutos, preservando
  // os componentes da data/hora local, sem converter o fuso.
  const date = new Date(local + ":00Z");
  date.setUTCMinutes(date.getUTCMinutes() + difference);
  return date.toISOString().slice(0, 16);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const token = process.env.AGENDA_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.AGENDA_TELEGRAM_GROUP_CHAT_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !chatId || !url || !serviceRoleKey) {
    return NextResponse.json({ error: "Telegram ou Supabase não configurados." }, { status: 503 });
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const current = nowLocal();
  const date = current.slice(0, 10);
  const tomorrow = atMinute(date + "T00:00", 1440).slice(0, 10);
  const { data, error } = await supabase
    .from("agenda_events")
    .select("id,title,description,location,event_date,start_time,reminder_minutes")
    .eq("status", "scheduled")
    .gte("event_date", date)
    .lte("event_date", tomorrow)
    .not("start_time", "is", null);
  if (error) return NextResponse.json({ error: "Falha ao buscar compromissos." }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const event of (data ?? []) as AgendaRow[]) {
    if (event.reminder_minutes === null) continue;
    const dueAt = atMinute(event.event_date + "T" + (event.start_time ?? "00:00").slice(0, 5), -event.reminder_minutes);
    // A chamada deve ocorrer em até 10 minutos do vencimento.
    if (dueAt > current || atMinute(dueAt, 10) <= current) continue;
    const eventKey = event.id + ":" + dueAt + ":" + event.reminder_minutes;
    // A reserva UNIQUE vem antes do envio: chamadas concorrentes não duplicam avisos.
    const claim = await supabase.from("agenda_telegram_delivery")
      .insert({ event_key: eventKey, event_id: event.id, delivery_status: "pending" });
    if (claim.error?.code === "23505") continue;
    if (claim.error) { failed += 1; continue; }

    const assignees = await supabase.from("agenda_event_assignees")
      .select("profile_id").eq("event_id", event.id);
    const ids = (assignees.data ?? []).map((row) => row.profile_id);
    const profiles = ids.length ? await supabase.from("profiles").select("name").in("id", ids) : null;
    const names = (profiles?.data ?? []).map((row) => row.name).filter(Boolean).join(", ");
    const lines = [
      "📅 Jornal IR | Lembrete da Agenda",
      event.title,
      "Quando: " + event.event_date.split("-").reverse().join("/") + " às " + event.start_time?.slice(0, 5) + "h",
      names ? "Responsáveis: " + names : null,
      event.location ? "Local: " + event.location : null,
      event.description ? "Observações: " + event.description.slice(0, 1500) : null,
    ].filter(Boolean);
    try {
      const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: lines.join("\n"), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const message = "Telegram HTTP " + response.status;
        await supabase.from("agenda_telegram_delivery").update({
          delivery_status: "failed", last_error: message,
        }).eq("event_key", eventKey);
        failed += 1;
        continue;
      }
      const result = await supabase.from("agenda_telegram_delivery").update({
        delivery_status: "sent", sent_at: new Date().toISOString(), last_error: null,
      }).eq("event_key", eventKey);
      if (result.error) { failed += 1; continue; }
      sent += 1;
    } catch (error) {
      // Resposta perdida pode significar envio efetivado: nao repetir automaticamente.
      await supabase.from("agenda_telegram_delivery").update({
        delivery_status: "uncertain", last_error: error instanceof Error ? error.message.slice(0, 300) : "Sem resposta",
      }).eq("event_key", eventKey);
      failed += 1;
    }
  }
  return NextResponse.json({ sent, failed });
}
