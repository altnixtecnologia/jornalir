"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { listReportExcludedReceivableIds } from "../../../../providers/supabase/receivableReportExclusion.supabase";
import { isWhatsappCloudConfigured } from "../../../../lib/financeiro/whatsappCloudProvider";
import { whatsappSender } from "../../../../lib/notifications/providerSender";
import { processClaimed, saoPauloDate, type ClaimedRow, type Counts } from "../../../../lib/notifications/notificationDispatcher";
import { approvedTemplateName, TEMPLATE_DEFINITIONS } from "../../../../lib/notifications/whatsappTemplates";
import {
  BATCH_KIND_EVENT, DISPATCH_STATUS_LABELS, evaluateBatchCandidate, manualOccurrence, type BatchKind,
} from "../../../../lib/notifications/financialBatchEligibility";

const MAX_ROWS = 200;
const MAX_SELECTED = 100;
const PROCESS_CHUNK = 25;
type Result<T> = { ok: true; data: T } | { error: string };

export type BatchCandidateRow = {
  key: string; clientName: string; reference: string; amount: number; dueDate: string | null;
  eligible: boolean; reason: string | null; phoneMasked: string | null;
};
type Base = {
  key: string; receivableId: string; kind: BatchKind;
  receivable: { id: string; status: string; balance: number; dueDate: string; reference: string };
  client: { id: string; name: string; active: boolean; whatsapp: string | null };
  amount: number; paidCharge?: { paymentMethod?: string; status: string; amount: number; providerChargeId?: string; paidAt?: string } | null;
  receipt?: { id: string; amount: number; reversed: boolean } | null;
};

const CLIENT_COLUMNS = "clients(id,kind,full_name,company_name,trade_name,status,whatsapp)";
const RECEIVABLE_COLUMNS = `id,client_id,status,balance,due_date,description,internal_reference,${CLIENT_COLUMNS}`;
type ClientRow = { id: string; kind: string; full_name: string | null; company_name: string | null; trade_name: string | null; status: string; whatsapp: string | null };

function clientName(c: ClientRow): string {
  return (c.kind === "individual" ? c.full_name : c.trade_name || c.company_name) || "Cliente";
}
function unwrapClient(value: unknown): ClientRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as ClientRow) : null;
}
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function requireSender(): Promise<{ db: SupabaseClient; actorId: string } | { error: string }> {
  const denied = await checkFinanceAction("pix_enviar");
  if (denied) return { error: denied };
  const db = createSupabaseServerClient();
  try { return { db, actorId: (await getAuditContext(db)).actorId }; } catch { return { error: "Sessão inválida. Faça login novamente." }; }
}

/** Carrega a base por tipo, em consultas em lote (sem consulta por cliente). `ids` restringe ao conjunto escolhido. */
async function loadBase(db: SupabaseClient, kind: BatchKind, opts: { ids?: string[]; from?: string; to?: string; search?: string }): Promise<Base[] | { error: string }> {
  const rows: Base[] = [];
  const toBase = (r: Record<string, unknown>, extra: Partial<Base> & { key: string; amount: number }): Base | null => {
    const c = unwrapClient(r.clients);
    if (!c) return null;
    return {
      kind, receivableId: String(r.id),
      receivable: { id: String(r.id), status: String(r.status), balance: Number(r.balance), dueDate: String(r.due_date), reference: String(r.description || r.internal_reference || "Cobrança") },
      client: { id: c.id, name: clientName(c), active: c.status === "active", whatsapp: c.whatsapp }, ...extra,
    };
  };
  if (kind === "billing") {
    let q = db.from("receivables_with_balance").select(RECEIVABLE_COLUMNS).in("status", ["open", "partially_paid"]).gt("balance", 0).order("due_date").limit(MAX_ROWS);
    if (opts.ids) q = q.in("id", opts.ids);
    if (opts.from) q = q.gte("due_date", opts.from);
    if (opts.to) q = q.lte("due_date", opts.to);
    const { data, error } = await q;
    if (error) return { error: "Não foi possível consultar os títulos." };
    for (const r of data ?? []) { const b = toBase(r as Record<string, unknown>, { key: String((r as { id: string }).id), amount: Number((r as { balance: number }).balance) }); if (b) rows.push(b); }
  } else if (kind === "confirmation") {
    let q = db.from("payment_charges").select("receivable_id,amount,status,provider_charge_id,paid_at,payment_method").eq("status", "paid").order("paid_at", { ascending: false }).limit(MAX_ROWS);
    if (opts.ids) q = q.in("receivable_id", opts.ids);
    if (opts.from) q = q.gte("paid_at", opts.from);
    if (opts.to) q = q.lte("paid_at", `${opts.to}T23:59:59-03:00`);
    const { data: charges, error } = await q;
    if (error) return { error: "Não foi possível consultar os pagamentos." };
    const ids = [...new Set((charges ?? []).map((c) => String(c.receivable_id)))];
    if (!ids.length) return rows;
    const { data: receivables, error: rerr } = await db.from("receivables_with_balance").select(RECEIVABLE_COLUMNS).in("id", ids);
    if (rerr) return { error: "Não foi possível consultar os títulos." };
    const byId = new Map((receivables ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
    const seen = new Set<string>();
    for (const c of charges ?? []) {
      const rid = String(c.receivable_id);
      if (seen.has(rid) || !byId.has(rid)) continue; // um aviso por título (pagamento mais recente)
      seen.add(rid);
      const b = toBase(byId.get(rid)!, { key: rid, amount: Number(c.amount), paidCharge: { paymentMethod: c.payment_method ? String(c.payment_method) : undefined, status: String(c.status), amount: Number(c.amount), providerChargeId: c.provider_charge_id ? String(c.provider_charge_id) : undefined, paidAt: c.paid_at ? String(c.paid_at) : undefined } });
      if (b) rows.push(b);
    }
  } else {
    let q = db.from("receivable_receipts").select("id,receivable_id,amount,received_at,reversed_at").is("reversed_at", null).order("received_at", { ascending: false }).limit(MAX_ROWS);
    if (opts.ids) q = q.in("id", opts.ids);
    if (opts.from) q = q.gte("received_at", opts.from);
    if (opts.to) q = q.lte("received_at", `${opts.to}T23:59:59-03:00`);
    const { data: receipts, error } = await q;
    if (error) return { error: "Não foi possível consultar os recibos." };
    const ids = [...new Set((receipts ?? []).map((r) => String(r.receivable_id)))];
    if (!ids.length) return rows;
    const { data: receivables, error: rerr } = await db.from("receivables_with_balance").select(RECEIVABLE_COLUMNS).in("id", ids);
    if (rerr) return { error: "Não foi possível consultar os títulos." };
    const byId = new Map((receivables ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
    for (const rc of receipts ?? []) {
      const base = byId.get(String(rc.receivable_id));
      const b = base ? toBase(base, { key: String(rc.id), amount: Number(rc.amount), receipt: { id: String(rc.id), amount: Number(rc.amount), reversed: Boolean(rc.reversed_at) } }) : null;
      if (b) rows.push(b);
    }
  }
  const term = (opts.search ?? "").trim().toLowerCase();
  return term ? rows.filter((r) => r.client.name.toLowerCase().includes(term) || r.receivable.reference.toLowerCase().includes(term)) : rows;
}

/** Enriquece e decide. Três consultas em lote no total: teste classificado, Pix pendente e registros de hoje. */
async function decide(db: SupabaseClient, kind: BatchKind, base: Base[]) {
  const receivableIds = [...new Set(base.map((b) => b.receivableId))];
  const event = BATCH_KIND_EVENT[kind];
  const today = manualOccurrence(saoPauloDate(new Date()));
  const [excluded, charges, ledger] = await Promise.all([
    listReportExcludedReceivableIds(db),
    kind === "billing" && receivableIds.length
      ? db.from("payment_charges").select("receivable_id,status,amount,provider,provider_charge_id,public_token,expires_at").eq("status", "pending").in("receivable_id", receivableIds)
      : Promise.resolve({ data: [], error: null }),
    base.length
      ? db.from("customer_notification_dispatches").select("entity_id").eq("event_type", event).eq("occurrence", today).in("entity_id", base.map((b) => b.key))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const pendingByReceivable = new Map((charges.data ?? []).map((c) => [String(c.receivable_id), c]));
  const sentToday = new Set((ledger.data ?? []).map((l) => String(l.entity_id)));
  const portalUrl = (process.env.WHATSAPP_PORTAL_URL ?? "https://cliente.altnix.com.br").replace(/\/$/, "");
  return base.map((b) => {
    const pc = pendingByReceivable.get(b.receivableId);
    const decision = evaluateBatchCandidate({
      kind, now: Date.now(), portalUrl,
      receivable: { ...b.receivable, excludedFromReports: excluded.includes(b.receivableId) },
      client: b.client,
      pendingCharge: pc ? { status: String(pc.status), amount: Number(pc.amount), provider: pc.provider ? String(pc.provider) : undefined, providerChargeId: pc.provider_charge_id ? String(pc.provider_charge_id) : undefined, publicToken: pc.public_token ? String(pc.public_token) : undefined, expiresAt: pc.expires_at ? String(pc.expires_at) : undefined } : null,
      paidCharge: b.paidCharge ?? null, receipt: b.receipt ?? null,
      recentSent: sentToday.has(b.key),
    });
    return { base: b, decision };
  });
}

/** Prévia: quem receberia, com WhatsApp mascarado e o motivo de cada exclusão. Nada é enviado. */
export async function findFinancialNotificationCandidatesAction(input: { kind: BatchKind; from?: string; to?: string; search?: string }): Promise<Result<BatchCandidateRow[]>> {
  const caller = await requireSender();
  if ("error" in caller) return caller;
  if (!(input.kind in BATCH_KIND_EVENT)) return { error: "Tipo de mensagem inválido." };
  const dateOk = (v?: string) => v === undefined || v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!dateOk(input.from) || !dateOk(input.to)) return { error: "Período inválido." };
  const base = await loadBase(caller.db, input.kind, { from: input.from || undefined, to: input.to || undefined, search: input.search });
  if ("error" in base) return base;
  const decided = await decide(caller.db, input.kind, base);
  return { ok: true, data: decided.map(({ base: b, decision }) => ({
    key: b.key, clientName: b.client.name, reference: b.receivable.reference, amount: b.amount, dueDate: b.receivable.dueDate,
    eligible: decision.eligible, reason: decision.eligible ? null : decision.reason, phoneMasked: decision.phoneMasked,
  })) };
}

export type BatchOutcome = { batchId: string; requested: number; enqueued: number; duplicated: number; ineligible: number; counts: Counts; remaining: number };

async function pendingRemaining(batchId: string): Promise<number> {
  const { count } = await createSupabaseAdminClient().from("customer_notification_dispatches")
    .select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["pending", "processing"]);
  return count ?? 0;
}

async function processBatchChunk(batchId: string): Promise<Counts> {
  const admin = createSupabaseAdminClient();
  const claim = await admin.rpc("customer_notification_claim", { p_origin: "manual", p_limit: PROCESS_CHUNK, p_batch: batchId });
  if (claim.error) throw new Error("Não foi possível iniciar o envio.");
  return processClaimed(async (n, a) => await admin.rpc(n, a), whatsappSender, (claim.data as ClaimedRow[]) ?? [], Date.now() + 40000);
}

/** Cria o lote (uma mensagem individual por cliente) e processa o primeiro bloco. Reconfere TUDO no servidor. */
export async function sendFinancialNotificationBatchAction(input: { kind: BatchKind; keys: string[] }): Promise<Result<BatchOutcome>> {
  const caller = await requireSender();
  if ("error" in caller) return caller;
  if (!(input.kind in BATCH_KIND_EVENT)) return { error: "Tipo de mensagem inválido." };
  const keys = [...new Set((input.keys ?? []).filter(isUuid))];
  if (!keys.length) return { error: "Selecione ao menos uma cobrança." };
  if (keys.length > MAX_SELECTED) return { error: `Selecione no máximo ${MAX_SELECTED} por lote.` };
  if (!isWhatsappCloudConfigured()) return { error: "WhatsApp Cloud API não configurada neste ambiente." };
  const event = BATCH_KIND_EVENT[input.kind];
  const template = approvedTemplateName(event, process.env);
  if (!template) return { error: `Template não configurado. Aprove na Meta o modelo "${TEMPLATE_DEFINITIONS[event].proposedName}" e informe-o em ${TEMPLATE_DEFINITIONS[event].envVar}.` };

  const base = await loadBase(caller.db, input.kind, { ids: keys });
  if ("error" in base) return base;
  const decided = await decide(caller.db, input.kind, base);
  const eligible = decided.filter((d) => d.decision.eligible);
  if (!eligible.length) return { error: "Nenhuma das cobranças selecionadas está elegível agora. Atualize a prévia." };

  const batchId = crypto.randomUUID();
  const occurrence = manualOccurrence(saoPauloDate(new Date()));
  const rows = eligible.map(({ base: b, decision }) => {
    const d = decision as Extract<typeof decision, { eligible: true }>;
    return {
      event_type: event, entity_type: d.entityType, entity_id: d.entityId, occurrence, client_id: b.client.id,
      origin: "manual", batch_id: batchId, requested_by: caller.actorId, template_name: template,
      to_phone: d.e164, params: d.params, status: "pending", status_reason: null,
    };
  });
  const admin = createSupabaseAdminClient();
  const enq = await admin.rpc("customer_notification_enqueue", { p_rows: rows });
  if (enq.error) return { error: "Não foi possível registrar o lote." };
  const enqueued = Number(enq.data) || 0;
  let counts: Counts;
  try { counts = await processBatchChunk(batchId); } catch { return { error: "Lote registrado, mas o envio não pôde iniciar. Use Continuar envio." }; }
  return { ok: true, data: { batchId, requested: keys.length, enqueued, duplicated: rows.length - enqueued, ineligible: keys.length - eligible.length, counts, remaining: await pendingRemaining(batchId) } };
}

/** Continua o lote (próximo bloco). Reivindicação atômica: duas abas não enviam o mesmo cliente duas vezes. */
export async function continueFinancialNotificationBatchAction(batchId: string): Promise<Result<{ counts: Counts; remaining: number }>> {
  const caller = await requireSender();
  if ("error" in caller) return caller;
  if (!isUuid(batchId)) return { error: "Lote inválido." };
  if (!isWhatsappCloudConfigured()) return { error: "WhatsApp Cloud API não configurada neste ambiente." };
  try {
    const counts = await processBatchChunk(batchId);
    return { ok: true, data: { counts, remaining: await pendingRemaining(batchId) } };
  } catch { return { error: "Não foi possível continuar o envio." }; }
}

export type BatchResultRow = { id: string; clientName: string; reference: string | null; status: string; statusLabel: string; detail: string | null; canRetry: boolean; canRetryUncertain: boolean };


/** Resultado individual de cada destinatário do lote. */
export async function getFinancialNotificationBatchAction(batchId: string): Promise<Result<BatchResultRow[]>> {
  const caller = await requireSender();
  if ("error" in caller) return caller;
  if (!isUuid(batchId)) return { error: "Lote inválido." };
  const { data, error } = await caller.db.from("customer_notification_dispatches")
    .select(`id,status,status_reason,error_message,attempts,entity_id,params,${CLIENT_COLUMNS}`).eq("batch_id", batchId).order("created_at");
  if (error) return { error: "Não foi possível consultar o lote." };
  return { ok: true, data: (data ?? []).map((r) => {
    const c = unwrapClient((r as { clients?: unknown }).clients);
    const params = Array.isArray((r as { params?: unknown }).params) ? ((r as { params: unknown[] }).params) : [];
    const status = String(r.status);
    return {
      id: String(r.id), clientName: c ? clientName(c) : "Cliente", reference: params[1] ? String(params[1]) : null, status,
      statusLabel: DISPATCH_STATUS_LABELS[status] ?? status,
      detail: status === "failed" || status === "uncertain" || status === "skipped" ? String(r.error_message || r.status_reason || "").slice(0, 200) || null : null,
      canRetry: status === "failed" && Number(r.attempts) < 6, canRetryUncertain: status === "uncertain" && Number(r.attempts) < 6,
    };
  }) };
}

/** Reenvio manual: falha definitiva, ou incerta com confirmação explícita (pode duplicar). Limitado a 6 tentativas. */
export async function retryFinancialNotificationAction(input: { id: string; confirmUncertain?: boolean }): Promise<Result<{ counts: Counts }>> {
  const caller = await requireSender();
  if ("error" in caller) return caller;
  if (!isUuid(input.id)) return { error: "Mensagem inválida." };
  if (!isWhatsappCloudConfigured()) return { error: "WhatsApp Cloud API não configurada neste ambiente." };
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from("customer_notification_dispatches").select("batch_id,origin").eq("id", input.id).maybeSingle();
  if (!row?.batch_id || row.origin !== "manual") return { error: "Mensagem não encontrada." };
  const requeued = await admin.rpc("customer_notification_requeue", { p_id: input.id, p_actor: caller.actorId, p_confirm_uncertain: input.confirmUncertain === true });
  if (requeued.error || requeued.data !== true) return { error: "Esta mensagem não pode ser reenviada (limite de tentativas, ou não está em falha)." };
  try { return { ok: true, data: { counts: await processBatchChunk(String(row.batch_id)) } }; }
  catch { return { error: "Reenvio registrado, mas não pôde iniciar. Use Continuar envio." }; }
}
