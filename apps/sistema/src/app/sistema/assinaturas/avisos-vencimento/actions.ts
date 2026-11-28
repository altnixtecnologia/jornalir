"use server";

import { revalidatePath } from "next/cache";
import { SUBSCRIPTION_SERVICE_TYPE_LABELS, type SubscriptionServiceType } from "@ir/types";
import { resolveClientWhatsappRecipient, WHATSAPP_RECIPIENT_MESSAGES } from "@ir/core";
import { failureKind } from "../../../../lib/notifications/whatsappErrors";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  isWhatsappDueReminderTemplateConfigured, sendWhatsappDueReminderTemplate,
} from "../../../../lib/financeiro/whatsappCloudProvider";

const PATH = "/sistema/assinaturas/avisos-vencimento";
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

function clientDisplayName(c: { kind: string; full_name: string | null; company_name: string | null; trade_name: string | null }): string {
  if (c.kind === "individual") return c.full_name || "Pessoa sem nome";
  return c.trade_name || c.company_name || "Empresa sem nome";
}

/** Prévia ao operador: mesmo critério do envio (WhatsApp canônico; fixo não conta como WhatsApp). */
function previewRecipient(client: { whatsapp: string | null }): { phone: string | null; valid: boolean } {
  const resolved = resolveClientWhatsappRecipient({ whatsapp: client.whatsapp });
  return resolved.ok ? { phone: resolved.e164, valid: true } : { phone: client.whatsapp || null, valid: false };
}

export interface DueReminderCandidate {
  clientId: string;
  clientName: string;
  phone: string | null;
  phoneValid: boolean;
  subscriptionIds: string[];
  subscriptionLabels: string[];
  dueDates: string[];
  dueDayMismatch: boolean;
}

/** Monta os candidatos a partir de subscriptions ativas com next_due_date no
 * intervalo pedido — NUNCA inventa data: assinaturas sem next_due_date
 * preenchido ficam de fora da lista automática (podem ser adicionadas
 * manualmente depois, via busca). Agrupa por cliente — um cliente com mais
 * de uma assinatura vencendo no período vira UM candidato só, nunca duas
 * linhas (requisito explícito de nunca duplicar o aviso). */
export async function findDueReminderCandidatesAction(input: {
  startDate: string; endDate: string;
}): Promise<ActionResult<DueReminderCandidate[]>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.startDate > input.endDate) {
    return { error: "Período inválido." };
  }
  const { data, error } = await caller.db.from("subscriptions")
    .select("id,client_id,service_type,next_due_date,due_day,clients(id,kind,full_name,company_name,trade_name,whatsapp,status)")
    .eq("status", "active")
    .gte("next_due_date", input.startDate)
    .lte("next_due_date", input.endDate)
    .order("next_due_date", { ascending: true });
  if (error) return { error: "Não foi possível consultar as assinaturas a vencer." };

  const byClient = new Map<string, DueReminderCandidate>();
  for (const row of data ?? []) {
    const client = row.clients as unknown as {
      id: string; kind: string; full_name: string | null; company_name: string | null; trade_name: string | null;
      whatsapp: string | null; status: string;
    } | null;
    if (!client || client.status !== "active") continue; // cadastro mestre inativo nunca entra na lista.
    const recipient = previewRecipient(client);
    const dueDate = row.next_due_date as string;
    const dueDayMismatch = Boolean(row.due_day) && Number(dueDate.slice(8, 10)) !== row.due_day;
    const existing = byClient.get(client.id);
    const label = SUBSCRIPTION_SERVICE_TYPE_LABELS[row.service_type as SubscriptionServiceType] ?? row.service_type;
    if (existing) {
      existing.subscriptionIds.push(row.id);
      existing.subscriptionLabels.push(label);
      existing.dueDates.push(dueDate);
      existing.dueDayMismatch = existing.dueDayMismatch || dueDayMismatch;
    } else {
      byClient.set(client.id, {
        clientId: client.id, clientName: clientDisplayName(client),
        phone: recipient.phone, phoneValid: recipient.valid,
        subscriptionIds: [row.id], subscriptionLabels: [label], dueDates: [dueDate],
        dueDayMismatch,
      });
    }
  }
  return { ok: true, data: [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR")) };
}

/** Busca livre para adicionar manualmente outros clientes à lista — só
 * clientes ativos com ao menos uma assinatura ativa (não necessariamente
 * vencendo no período filtrado). */
export async function searchClientsForDueReminderAction(query: string): Promise<ActionResult<DueReminderCandidate[]>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const q = query.trim();
  if (q.length < 2) return { ok: true, data: [] };
  const { data: clients, error: clientsError } = await caller.db.from("clients")
    .select("id,kind,full_name,company_name,trade_name,whatsapp,status")
    .eq("status", "active")
    .or(`full_name.ilike.%${q}%,company_name.ilike.%${q}%,trade_name.ilike.%${q}%`)
    .limit(15);
  if (clientsError) return { error: "Não foi possível buscar clientes." };
  const clientIds = (clients ?? []).map((c) => c.id);
  if (clientIds.length === 0) return { ok: true, data: [] };
  const { data: subs, error: subsError } = await caller.db.from("subscriptions")
    .select("id,client_id,service_type,next_due_date")
    .eq("status", "active").in("client_id", clientIds);
  if (subsError) return { error: "Não foi possível consultar as assinaturas." };
  const subsByClient = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const list = subsByClient.get(s.client_id) ?? [];
    list.push(s);
    subsByClient.set(s.client_id, list);
  }
  const results: DueReminderCandidate[] = [];
  for (const client of clients ?? []) {
    const clientSubs = subsByClient.get(client.id) ?? [];
    if (clientSubs.length === 0) continue; // sem assinatura ativa, não entra (módulo é específico de Assinaturas).
    const recipient = previewRecipient(client);
    results.push({
      clientId: client.id, clientName: clientDisplayName(client),
      phone: recipient.phone, phoneValid: recipient.valid,
      subscriptionIds: clientSubs.map((s) => s.id),
      subscriptionLabels: clientSubs.map((s) => SUBSCRIPTION_SERVICE_TYPE_LABELS[s.service_type as SubscriptionServiceType] ?? s.service_type),
      dueDates: clientSubs.map((s) => s.next_due_date).filter((d): d is string => Boolean(d)),
      dueDayMismatch: false,
    });
  }
  return { ok: true, data: results };
}

export interface DueReminderBatchRow {
  id: string;
  referenceMonth: string;
  messageTemplate: string;
  status: "draft" | "sending" | "sent";
  createdAt: string;
  sentAt: string | null;
  recipientCount: number;
}

export async function listDueReminderBatchesAction(): Promise<ActionResult<DueReminderBatchRow[]>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const { data, error } = await caller.db.from("subscription_due_reminder_batches")
    .select("id,reference_month,message_template,status,created_at,sent_at,subscription_due_reminder_recipients(count)")
    .order("created_at", { ascending: false }).limit(30);
  if (error) return { error: "Não foi possível carregar o histórico." };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, referenceMonth: r.reference_month, messageTemplate: r.message_template, status: r.status,
      createdAt: r.created_at, sentAt: r.sent_at,
      recipientCount: (r.subscription_due_reminder_recipients as unknown as Array<{ count: number }>)?.[0]?.count ?? 0,
    })),
  };
}

export interface DueReminderRecipientRow {
  id: string; clientId: string; clientName: string | null; phone: string | null; phoneValid: boolean;
  subscriptionIds: string[]; status: string; messageRendered: string | null; errorMessage: string | null;
}

export async function getDueReminderBatchDetailAction(batchId: string): Promise<ActionResult<{ batch: DueReminderBatchRow; recipients: DueReminderRecipientRow[] }>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const { data: batch, error: batchError } = await caller.db.from("subscription_due_reminder_batches")
    .select("id,reference_month,message_template,status,created_at,sent_at").eq("id", batchId).maybeSingle();
  if (batchError || !batch) return { error: "Lote não encontrado." };
  const { data: recipients, error: recipientsError } = await caller.db.from("subscription_due_reminder_recipients")
    .select("id,client_id,subscription_ids,phone_snapshot,phone_valid,status,message_rendered,error_message,clients(full_name,company_name,trade_name,kind)")
    .eq("batch_id", batchId);
  if (recipientsError) return { error: "Não foi possível carregar os destinatários." };
  return {
    ok: true,
    data: {
      batch: {
        id: batch.id, referenceMonth: batch.reference_month, messageTemplate: batch.message_template, status: batch.status,
        createdAt: batch.created_at, sentAt: batch.sent_at, recipientCount: (recipients ?? []).length,
      },
      recipients: (recipients ?? []).map((r) => {
        const c = r.clients as unknown as { full_name: string | null; company_name: string | null; trade_name: string | null; kind: string } | null;
        return {
          id: r.id, clientId: r.client_id, clientName: c ? clientDisplayName(c) : null,
          phone: r.phone_snapshot, phoneValid: r.phone_valid,
          subscriptionIds: r.subscription_ids, status: r.status,
          messageRendered: r.message_rendered, errorMessage: r.error_message,
        };
      }),
    },
  };
}

export interface SaveDueReminderBatchInput {
  id?: string;
  referenceMonth: string;
  messageTemplate: string;
  recipients: Array<{ clientId: string; subscriptionIds: string[]; phone: string | null }>;
}

/** Salva o rascunho inteiro (lote + destinatários) de uma vez — a lista é
 * editável no cliente (adicionar/remover/pesquisar) e só persiste quando o
 * operador salva. Nunca envia nada; status continua "draft". */
export async function saveDueReminderDraftAction(input: SaveDueReminderBatchInput): Promise<ActionResult<{ id: string }>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const { db, userId } = caller;
  if (!/^\d{4}-\d{2}-01$/.test(input.referenceMonth)) return { error: "Mês de referência inválido." };
  const template = input.messageTemplate.trim();
  if (!template) return { error: "Informe o texto da mensagem." };
  if (template.length > 1000) return { error: "Mensagem muito longa (máximo 1000 caracteres)." };
  const uniqueClientIds = new Set(input.recipients.map((r) => r.clientId));
  if (uniqueClientIds.size !== input.recipients.length) return { error: "Há clientes duplicados na lista de destinatários." };
  if (input.recipients.length === 0) return { error: "Adicione ao menos um destinatário." };

  let batchId = input.id;
  if (batchId) {
    const { data: existing, error: existingError } = await db.from("subscription_due_reminder_batches")
      .select("status").eq("id", batchId).maybeSingle();
    if (existingError || !existing) return { error: "Lote não encontrado." };
    if (existing.status !== "draft") return { error: "Este lote já foi enviado e não pode mais ser editado." };
    const { error: updateError } = await db.from("subscription_due_reminder_batches")
      .update({ reference_month: input.referenceMonth, message_template: template }).eq("id", batchId);
    if (updateError) return { error: "Não foi possível salvar o lote." };
    const { error: deleteError } = await db.from("subscription_due_reminder_recipients").delete().eq("batch_id", batchId);
    if (deleteError) return { error: "Não foi possível atualizar os destinatários." };
  } else {
    const { data: created, error: createError } = await db.from("subscription_due_reminder_batches")
      .insert({ reference_month: input.referenceMonth, message_template: template, created_by: userId })
      .select("id").single();
    if (createError || !created) return { error: "Não foi possível criar o lote." };
    batchId = created.id;
  }

  // O telefone NUNCA vem do navegador: é resolvido aqui a partir do cadastro mestre (WhatsApp canônico)
  // e as assinaturas precisam pertencer ao cliente informado. Cadastro inativo/inexistente invalida o lote.
  const clientIds = [...uniqueClientIds];
  const allSubscriptionIds = [...new Set(input.recipients.flatMap((r) => r.subscriptionIds))];
  const [clientsResult, subscriptionsResult] = await Promise.all([
    db.from("clients").select("id,status,whatsapp").in("id", clientIds),
    allSubscriptionIds.length ? db.from("subscriptions").select("id,client_id").in("id", allSubscriptionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientsResult.error || subscriptionsResult.error) return { error: "Não foi possível validar os destinatários." };
  const clientById = new Map((clientsResult.data ?? []).map((c) => [c.id as string, c]));
  const subscriptionOwner = new Map((subscriptionsResult.data ?? []).map((s) => [s.id as string, s.client_id as string]));
  for (const r of input.recipients) {
    const known = clientById.get(r.clientId);
    if (!known || known.status !== "active") return { error: "Há destinatário com cadastro inexistente ou inativo. Atualize a lista." };
    if (r.subscriptionIds.some((id) => subscriptionOwner.get(id) !== r.clientId)) return { error: "Há assinatura que não pertence ao cliente informado. Atualize a lista." };
  }
  const rows = input.recipients.map((r) => {
    const known = clientById.get(r.clientId)!;
    const resolved = resolveClientWhatsappRecipient({ whatsapp: known.whatsapp as string | null });
    return {
      batch_id: batchId, client_id: r.clientId, subscription_ids: r.subscriptionIds,
      phone_snapshot: resolved.ok ? resolved.e164 : null, phone_valid: resolved.ok,
    };
  });
  const { error: insertError } = await db.from("subscription_due_reminder_recipients").insert(rows);
  if (insertError) return { error: "Não foi possível salvar os destinatários: " + insertError.message };

  revalidatePath(PATH);
  return { ok: true, data: { id: batchId! } };
}

export async function deleteDueReminderDraftAction(batchId: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  const { error } = await caller.db.from("subscription_due_reminder_batches").delete().eq("id", batchId).eq("status", "draft");
  if (error) return { error: "Não foi possível excluir o lote." };
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function isWhatsappDueReminderReady(): Promise<{ templateConfigured: boolean; sendEnabled: boolean }> {
  const caller = await requireAdmin();
  if (!caller) return { templateConfigured: false, sendEnabled: false };
  return {
    templateConfigured: isWhatsappDueReminderTemplateConfigured(),
    sendEnabled: process.env.WHATSAPP_DUE_REMINDER_SEND_ENABLED === "true",
  };
}

function renderTemplate(template: string, vars: { cliente: string; assinatura: string; mesAno: string }): string {
  return template
    .replaceAll("{{cliente}}", vars.cliente)
    .replaceAll("{{assinatura}}", vars.assinatura)
    .replaceAll("{{mes_ano}}", vars.mesAno);
}

const MONTH_LABELS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Estados do lote: draft → sending → sent. "sending" só vira "sent" quando NENHUM destinatário está
 * pendente ou em envio; se o processo cair no meio, o lote continua "sending" (interrompido) e nunca
 * parece concluído. Retomar só é permitido depois de 5 minutos de inatividade. */
const RESUME_AFTER_MS = 5 * 60 * 1000;

function deliveryFailure(error: unknown): { status: "failed" | "uncertain"; message: string } {
  const message = error instanceof Error ? error.message : "Falha desconhecida";
  // Resposta ambígua (rede/timeout/sem ID): a Meta pode ter aceitado; nunca reenviar às cegas.
  return failureKind(error) === "ambiguous" ? { status: "uncertain", message } : { status: "failed", message };
}

/** Confirma o disparo manual de verdade — protegido por: (1) template
 * próprio aprovado na Meta configurado, (2) interruptor de ambiente
 * separado (WHATSAPP_DUE_REMINDER_SEND_ENABLED). Um destinatário de cada vez,
 * cada um reivindicado de forma atômica (pending → sending): duplo clique ou duas abas não duplicam. */
export async function confirmDueReminderBatchSendAction(batchId: string): Promise<ActionResult<{ sent: number; failed: number; skipped: number; uncertain: number; complete: boolean }>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  if (process.env.WHATSAPP_DUE_REMINDER_SEND_ENABLED !== "true") {
    return { error: "Envio real de avisos de vencimento ainda está desligado — aguardando template aprovado na Meta e autorização explícita." };
  }
  if (!isWhatsappDueReminderTemplateConfigured()) {
    return { error: "Configure WHATSAPP_DUE_REMINDER_TEMPLATE (template aprovado na Meta) antes de confirmar o envio." };
  }
  const { db, userId } = caller;
  const detail = await getDueReminderBatchDetailAction(batchId);
  if ("error" in detail) return detail;
  if (detail.data.batch.status === "sent") return { error: "Este lote já foi concluído." };

  const nowIso = new Date().toISOString();
  if (detail.data.batch.status === "draft") {
    // Trava atômica draft → sending (no máximo uma sessão inicia o lote).
    const { data: claimed, error: claimError } = await db.from("subscription_due_reminder_batches")
      .update({ status: "sending", sent_by: userId, claimed_at: nowIso })
      .eq("id", batchId).eq("status", "draft").select("id").maybeSingle();
    if (claimError || !claimed) return { error: "Este lote já foi iniciado por outra sessão." };
  } else {
    // Lote interrompido: retomada só após inatividade, por comparação atômica do instante da reivindicação.
    const { data: current } = await db.from("subscription_due_reminder_batches").select("claimed_at").eq("id", batchId).eq("status", "sending").maybeSingle();
    const claimedAt = current?.claimed_at ? Date.parse(String(current.claimed_at)) : NaN;
    if (!Number.isFinite(claimedAt) || Date.now() - claimedAt < RESUME_AFTER_MS)
      return { error: "Este lote está em envio. Aguarde alguns minutos; se foi interrompido, será possível retomá-lo." };
    const { data: reclaimed } = await db.from("subscription_due_reminder_batches")
      .update({ claimed_at: nowIso, sent_by: userId }).eq("id", batchId).eq("status", "sending").eq("claimed_at", current!.claimed_at).select("id").maybeSingle();
    if (!reclaimed) return { error: "Outra sessão retomou este lote." };
    // Quem estava "sending" quando o processo caiu pode ter sido enviado: vira incerto (nunca reenvio às cegas).
    await db.from("subscription_due_reminder_recipients").update({
      status: "uncertain", error_message: "Envio interrompido: confirme no WhatsApp antes de reenviar manualmente.",
    }).eq("batch_id", batchId).eq("status", "sending");
  }

  const monthDate = new Date(detail.data.batch.referenceMonth + "T12:00:00Z");
  const mesAno = `${MONTH_LABELS[monthDate.getUTCMonth()]}/${monthDate.getUTCFullYear()}`;

  let sent = 0, failed = 0, skipped = 0, uncertain = 0;
  for (const recipient of detail.data.recipients) {
    if (recipient.status !== "pending") continue; // enviado, ignorado, falho ou incerto: nunca reprocessado em massa
    // Reivindicação do destinatário: só quem muda pending → sending envia.
    const { data: mine } = await db.from("subscription_due_reminder_recipients")
      .update({ status: "sending" }).eq("id", recipient.id).eq("status", "pending").select("id").maybeSingle();
    if (!mine) continue;
    if (!recipient.phoneValid || !recipient.phone) {
      await db.from("subscription_due_reminder_recipients").update({ status: "skipped", error_message: "WhatsApp ausente ou inválido" }).eq("id", recipient.id);
      skipped++;
      continue;
    }
    const subscriptionLabel = "assinatura"; // rótulo genérico seguro — o detalhe completo já está em message_rendered/preview.
    const message = renderTemplate(detail.data.batch.messageTemplate, { cliente: recipient.clientName ?? "", assinatura: subscriptionLabel, mesAno });
    try {
      const result = await sendWhatsappDueReminderTemplate({
        toPhone: recipient.phone, clientName: recipient.clientName ?? "", subscriptionLabel, dueMonthLabel: mesAno,
      });
      await db.from("subscription_due_reminder_recipients").update({
        status: "sent", message_rendered: message, provider_message_id: result.providerMessageId ?? null, sent_at: new Date().toISOString(),
      }).eq("id", recipient.id);
      sent++;
    } catch (error) {
      const outcome = deliveryFailure(error);
      await db.from("subscription_due_reminder_recipients").update({
        status: outcome.status, message_rendered: message, error_message: outcome.message.slice(0, 500),
      }).eq("id", recipient.id);
      if (outcome.status === "uncertain") uncertain++; else failed++;
    }
  }

  // Só marca o lote como concluído quando ninguém ficou pendente ou em envio (processo interrompido ≠ concluído).
  const { count: open } = await db.from("subscription_due_reminder_recipients")
    .select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["pending", "sending"]);
  const complete = (open ?? 1) === 0;
  if (complete) {
    await db.from("subscription_due_reminder_batches")
      .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", batchId).eq("status", "sending");
  }
  revalidatePath(PATH);
  return { ok: true, data: { sent, failed, skipped, uncertain, complete } };
}

/** Reenvio MANUAL de um destinatário com falha DEFINITIVA (um por vez, nunca em massa nem automático).
 * Incerto não é reenviado aqui (pode já ter sido entregue). Reivindicação atômica failed → sending;
 * o telefone é resolvido de novo no cadastro (WhatsApp canônico). "Enviado" = aceito pela API da Meta. */
export async function retryDueReminderRecipientAction(recipientId: string): Promise<ActionResult<{ status: "sent" | "failed" | "uncertain" }>> {
  const caller = await requireAdmin();
  if (!caller) return { error: "Acesso não autorizado." };
  if (process.env.WHATSAPP_DUE_REMINDER_SEND_ENABLED !== "true" || !isWhatsappDueReminderTemplateConfigured())
    return { error: "Envio de avisos de vencimento desligado ou sem template aprovado." };
  const { db } = caller;
  const { data: claimed } = await db.from("subscription_due_reminder_recipients")
    .update({ status: "sending", error_message: null })
    .eq("id", recipientId).eq("status", "failed")
    .select("id,batch_id,client_id,clients(id,kind,full_name,company_name,trade_name,status,whatsapp)").maybeSingle();
  if (!claimed) return { error: "Só é possível reenviar destinatários com falha definitiva, e um reenvio por vez." };

  const fail = async (message: string): Promise<ActionResult<{ status: "sent" | "failed" | "uncertain" }>> => {
    await db.from("subscription_due_reminder_recipients").update({ status: "failed", error_message: message }).eq("id", recipientId);
    return { ok: true, data: { status: "failed" } };
  };
  const client = claimed.clients as unknown as { kind: string; full_name: string | null; company_name: string | null; trade_name: string | null; status: string; whatsapp: string | null } | null;
  if (!client || client.status !== "active") return fail("Cadastro inativo ou inexistente.");
  const resolved = resolveClientWhatsappRecipient({ whatsapp: client.whatsapp });
  if (!resolved.ok) return fail(WHATSAPP_RECIPIENT_MESSAGES[resolved.reason]);
  const { data: batch } = await db.from("subscription_due_reminder_batches")
    .select("reference_month,message_template,status").eq("id", claimed.batch_id).maybeSingle();
  if (!batch || batch.status !== "sent") return fail("Lote não está em estado de reenvio.");

  const monthDate = new Date(String(batch.reference_month) + "T12:00:00Z");
  const mesAno = `${MONTH_LABELS[monthDate.getUTCMonth()]}/${monthDate.getUTCFullYear()}`;
  const name = clientDisplayName(client);
  const message = renderTemplate(String(batch.message_template), { cliente: name, assinatura: "assinatura", mesAno });
  try {
    const result = await sendWhatsappDueReminderTemplate({ toPhone: resolved.e164, clientName: name, subscriptionLabel: "assinatura", dueMonthLabel: mesAno });
    await db.from("subscription_due_reminder_recipients").update({
      status: "sent", message_rendered: message, phone_snapshot: resolved.e164, phone_valid: true,
      provider_message_id: result.providerMessageId ?? null, sent_at: new Date().toISOString(), error_message: null,
    }).eq("id", recipientId);
    revalidatePath(PATH);
    return { ok: true, data: { status: "sent" } };
  } catch (error) {
    const outcome = deliveryFailure(error);
    await db.from("subscription_due_reminder_recipients").update({
      status: outcome.status, message_rendered: message, error_message: outcome.message.slice(0, 500),
    }).eq("id", recipientId);
    revalidatePath(PATH);
    return { ok: true, data: { status: outcome.status } };
  }
}
