"use server";

import { revalidatePath } from "next/cache";
import { SUBSCRIPTION_SERVICE_TYPE_LABELS, type SubscriptionServiceType } from "@ir/types";
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

function validPhone(raw: string | null): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
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
    .select("id,client_id,service_type,next_due_date,due_day,clients(id,kind,full_name,company_name,trade_name,phone_primary,whatsapp,status)")
    .eq("status", "active")
    .gte("next_due_date", input.startDate)
    .lte("next_due_date", input.endDate)
    .order("next_due_date", { ascending: true });
  if (error) return { error: "Não foi possível consultar as assinaturas a vencer." };

  const byClient = new Map<string, DueReminderCandidate>();
  for (const row of data ?? []) {
    const client = row.clients as unknown as {
      id: string; kind: string; full_name: string | null; company_name: string | null; trade_name: string | null;
      phone_primary: string | null; whatsapp: string | null; status: string;
    } | null;
    if (!client || client.status !== "active") continue; // cadastro mestre inativo nunca entra na lista.
    const phone = client.whatsapp || client.phone_primary;
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
        phone, phoneValid: validPhone(phone),
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
    .select("id,kind,full_name,company_name,trade_name,phone_primary,whatsapp,status")
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
    const phone = client.whatsapp || client.phone_primary;
    results.push({
      clientId: client.id, clientName: clientDisplayName(client),
      phone, phoneValid: validPhone(phone),
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
  status: "draft" | "sent";
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

  const rows = input.recipients.map((r) => ({
    batch_id: batchId, client_id: r.clientId, subscription_ids: r.subscriptionIds,
    phone_snapshot: r.phone, phone_valid: validPhone(r.phone),
  }));
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

/** Confirma o disparo manual de verdade — protegido por: (1) template
 * próprio aprovado na Meta configurado, (2) interruptor de ambiente
 * separado (WHATSAPP_DUE_REMINDER_SEND_ENABLED), ambos desligados até
 * autorização explícita nesta sessão. Processa um destinatário de cada
 * vez, registra o resultado individual, nunca reenvia quem já está
 * status=sent (idempotente por linha). */
export async function confirmDueReminderBatchSendAction(batchId: string): Promise<ActionResult<{ sent: number; failed: number; skipped: number }>> {
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
  if (detail.data.batch.status === "sent") return { error: "Este lote já foi enviado." };

  const monthDate = new Date(detail.data.batch.referenceMonth + "T12:00:00Z");
  const mesAno = `${MONTH_LABELS[monthDate.getUTCMonth()]}/${monthDate.getUTCFullYear()}`;

  let sent = 0, failed = 0, skipped = 0;
  for (const recipient of detail.data.recipients) {
    if (recipient.status === "sent") continue;
    if (!recipient.phoneValid || !recipient.phone) {
      await db.from("subscription_due_reminder_recipients").update({ status: "skipped", error_message: "Telefone ausente/inválido" }).eq("id", recipient.id);
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
      await db.from("subscription_due_reminder_recipients").update({
        status: "failed", message_rendered: message, error_message: error instanceof Error ? error.message : "Falha desconhecida",
      }).eq("id", recipient.id);
      failed++;
    }
  }

  await db.from("subscription_due_reminder_batches").update({
    status: "sent", sent_by: userId, sent_at: new Date().toISOString(),
  }).eq("id", batchId);

  revalidatePath(PATH);
  return { ok: true, data: { sent, failed, skipped } };
}
