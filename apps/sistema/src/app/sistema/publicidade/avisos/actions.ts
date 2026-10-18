"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const PATH = "/sistema/publicidade/avisos";
type ActionResult<T = undefined> = { ok: true; data: T } | { error: string };

async function requireAdmin() {
  const db = createSupabaseServerClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return null;
  const { data: profile } = await db.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active) return null;
  if (profile.role !== "owner" && profile.role !== "admin") return null;
  return { db, userId: auth.user.id };
}

function clean(value: string, length: number): string {
  return value.trim().slice(0, length);
}

export interface CommercialAnnouncementRow {
  id: string;
  title: string;
  body: string;
  href: string | null;
  status: "draft" | "sent";
  createdAt: string;
  sentAt: string | null;
}

export async function isCommercialPushSendEnabled(): Promise<boolean> {
  const caller = await requireAdmin();
  if (!caller) return false;
  return process.env.COMMERCIAL_PUSH_SEND_ENABLED === "true";
}

export async function listCommercialAnnouncements(): Promise<ActionResult<CommercialAnnouncementRow[]>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const { data, error } = await caller.db.from("commercial_announcements")
    .select("id,title,body,href,status,created_at,sent_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { error: "Não foi possível carregar o histórico de avisos." };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, title: r.title, body: r.body, href: r.href, status: r.status,
      createdAt: r.created_at, sentAt: r.sent_at,
    })),
  };
}

/** Resultado de entrega de UM aviso já enviado — leitura só, nunca reenvia. */
export async function getAnnouncementDeliveryStats(notificationEventId: string | null): Promise<ActionResult<{ pending: number; sent: number; failed: number; expired: number }>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!notificationEventId) return { ok: true, data: { pending: 0, sent: 0, failed: 0, expired: 0 } };
  const { data, error } = await caller.db.from("site_push_deliveries").select("status").eq("event_id", notificationEventId);
  if (error) return { error: "Não foi possível consultar o resultado da entrega." };
  const stats = { pending: 0, sent: 0, failed: 0, expired: 0 };
  for (const row of data ?? []) {
    const s = row.status as "pending" | "sending" | "sent" | "failed" | "expired";
    if (s === "sent") stats.sent += 1;
    else if (s === "failed") stats.failed += 1;
    else if (s === "expired") stats.expired += 1;
    else stats.pending += 1;
  }
  return { ok: true, data: stats };
}

export async function saveAnnouncementDraftAction(input: {
  id?: string; title: string; body: string; href: string;
}): Promise<ActionResult<{ id: string }>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const title = clean(input.title, 110);
  const body = clean(input.body, 320);
  const href = clean(input.href, 500);
  if (!title) return { error: "Informe o título do aviso." };
  if (!body) return { error: "Informe o texto do aviso." };
  if (href && (!href.startsWith("/") || href.startsWith("//") || /[\r\n]/.test(href))) {
    return { error: "O link, se informado, deve ser um caminho interno do site começando com /." };
  }
  if (input.id) {
    const { data, error } = await caller.db.from("commercial_announcements")
      .update({ title, body, href: href || null })
      .eq("id", input.id).eq("status", "draft")
      .select("id").maybeSingle();
    if (error || !data) return { error: "Não foi possível salvar o rascunho (talvez já tenha sido enviado)." };
    revalidatePath(PATH);
    return { ok: true, data: { id: data.id } };
  }
  const { data, error } = await caller.db.from("commercial_announcements")
    .insert({ title, body, href: href || null, created_by: caller.userId })
    .select("id").single();
  if (error || !data) return { error: "Não foi possível salvar o rascunho." };
  revalidatePath(PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteAnnouncementDraftAction(id: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const { error } = await caller.db.from("commercial_announcements").delete().eq("id", id).eq("status", "draft");
  if (error) return { error: "Não foi possível excluir o rascunho." };
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/** Confirma o envio de verdade — insere em notification_events (dispara a
 * fila real de entrega via trigger). Protegido por idempotência
 * (send_request_id único) e por um interruptor de ambiente: o envio real
 * fica desligado até a integração/app serem testados e autorizados
 * explicitamente (pedido do usuário em 18/10/2026), mesmo que a tela já
 * esteja pronta e usável para preparar/revisar avisos. */
export async function confirmAnnouncementSendAction(input: {
  id: string; requestId: string;
}): Promise<ActionResult<{ notificationEventId: string }>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId)) return { error: "Identificador de envio inválido." };

  if (process.env.COMMERCIAL_PUSH_SEND_ENABLED !== "true") {
    return { error: "Envio real de Avisos gerais ainda está desligado — aguardando integração/testes do aplicativo e autorização explícita." };
  }

  const { db, userId } = caller;
  const { data: draft, error: draftError } = await db.from("commercial_announcements")
    .select("id,title,body,href,status").eq("id", input.id).maybeSingle();
  if (draftError || !draft) return { error: "Aviso não encontrado." };
  if (draft.status !== "draft") return { error: "Este aviso já foi enviado." };

  const { data: event, error: eventError } = await db.from("notification_events").upsert({
    app_kind: "site", kind: "administrative",
    title: draft.title, body: draft.body, href: draft.href || "/",
    scheduled_at: new Date().toISOString(),
    dedupe_key: "commercial-announcement:" + input.requestId,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id").maybeSingle();
  if (eventError) return { error: "Falha ao preparar o envio: " + eventError.message };

  // ignoreDuplicates não retorna a linha quando já existia (reenvio do mesmo
  // request_id) — busca pelo dedupe_key para obter o id de qualquer forma,
  // nunca cria um segundo evento para o mesmo clique.
  const eventId = event?.id ?? (await db.from("notification_events").select("id")
    .eq("dedupe_key", "commercial-announcement:" + input.requestId).maybeSingle()).data?.id;
  if (!eventId) return { error: "Não foi possível confirmar o envio." };

  const { error: updateError } = await db.from("commercial_announcements").update({
    status: "sent", notification_event_id: eventId, send_request_id: input.requestId,
    sent_by: userId, sent_at: new Date().toISOString(),
  }).eq("id", input.id).eq("status", "draft");
  if (updateError) return { error: "Envio preparado, mas não foi possível atualizar o histórico. Confira em Avisos." };

  revalidatePath(PATH);
  return { ok: true, data: { notificationEventId: eventId } };
}
