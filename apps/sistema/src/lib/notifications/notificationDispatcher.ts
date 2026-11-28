import { resolveClientWhatsappRecipient } from "@ir/core";
import { failureKind } from "./whatsappErrors";
import {
  buildTemplateParams, EXPECTED_PARAM_COUNT,
  type AutomaticEvent, type NotificationConfig, type NotificationEvent,
} from "./whatsappTemplates";

/**
 * Despacho durável de notificações ao cliente (Jornal IR é a fonte dos eventos financeiros).
 *
 * Reaproveita a rotina diária já agendada (altnix-informativo: /api/cron/altnix-service-finance): sem
 * novo cron, sem polling. Uma consulta em lote por tipo (sem consulta por cliente), enfileiramento
 * idempotente (índice único evento + entidade + ocorrência + cliente), reivindicação atômica,
 * nova tentativa limitada só para recusa transitória e NUNCA reenvio às cegas após resultado ambíguo.
 * Disponível apenas com tudo configurado (ver readNotificationConfig); caso contrário não faz nada.
 */
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type Sender = (template: string, toE164: string, params: string[]) => Promise<{ providerMessageId: string }>;

export type DispatchRow = {
  event_type: NotificationEvent; entity_type: "receivable" | "receipt" | "service_outbox"; entity_id: string; occurrence: string;
  client_id: string; origin: "automatic" | "manual"; batch_id: string | null; requested_by: string | null;
  template_name: string; to_phone: string | null; params: string[]; status: "pending" | "skipped"; status_reason: string | null;
};

export type FinanceCandidate = {
  event_type: string; entity_type: string; entity_id: string; occurrence: string; client_id: string; client_name: string;
  whatsapp: string | null; reference: string | null; amount: number | string | null; due_date: string | null; event_date: string | null;
};
export type ServiceCandidate = {
  event_type: string; entity_type: string; entity_id: string; occurrence: string; client_id: string; client_name: string; whatsapp: string | null;
};

export const SKIP_REASONS = { no_whatsapp: "sem_whatsapp", whatsapp_invalid: "whatsapp_invalido" } as const;

/** Data civil em São Paulo (aaaa-mm-dd). */
export function saoPauloDate(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Candidatos → linhas do registro. Evento sem template aprovado nem entra; destinatário sem WhatsApp válido vira "skipped" com motivo. */
export function planDispatchRows(candidates: Array<FinanceCandidate | ServiceCandidate>, config: NotificationConfig): DispatchRow[] {
  const rows: DispatchRow[] = [];
  for (const candidate of candidates) {
    const event = candidate.event_type as AutomaticEvent;
    const template = config.templates[event];
    if (!template || !(event in config.templates)) continue;
    const base = {
      event_type: event, entity_type: candidate.entity_type as DispatchRow["entity_type"], entity_id: candidate.entity_id,
      occurrence: candidate.occurrence, client_id: candidate.client_id, origin: "automatic" as const,
      batch_id: null, requested_by: null, template_name: template,
    };
    const recipient = resolveClientWhatsappRecipient({ whatsapp: candidate.whatsapp });
    if (!recipient.ok) {
      rows.push({ ...base, to_phone: null, params: [], status: "skipped", status_reason: SKIP_REASONS[recipient.reason] });
      continue;
    }
    const finance = candidate as FinanceCandidate;
    const params = buildTemplateParams(event, {
      name: candidate.client_name, reference: finance.reference ?? undefined, amount: Number(finance.amount ?? 0),
      dueDate: finance.due_date ?? undefined, portalUrl: config.portalUrl,
    });
    if (params.length !== EXPECTED_PARAM_COUNT[event]) continue; // proteção contra divergência com o template aprovado
    rows.push({ ...base, to_phone: recipient.e164, params, status: "pending", status_reason: null });
  }
  return rows;
}

export type Counts = { claimed: number; accepted: number; retryable: number; failed: number; uncertain: number; skipped: number; deferred: number };
export const emptyCounts = (): Counts => ({ claimed: 0, accepted: 0, retryable: 0, failed: 0, uncertain: 0, skipped: 0, deferred: 0 });

export type ClaimedRow = { id: string; claim_token: string; template_name: string; to_phone: string | null; params: unknown };

/** Envia as linhas reivindicadas, uma por vez; registra a chamada ANTES e o resultado DEPOIS. */
export async function processClaimed(
  rpc: Rpc, send: Sender, claimed: ClaimedRow[], deadlineMs: number, clock: () => number = Date.now,
): Promise<Counts> {
  const counts = emptyCounts();
  counts.claimed = claimed.length;
  for (const row of claimed) {
    // Sem tempo: a linha segue "processing" e é recuperada (volta à fila) pela própria reivindicação seguinte.
    if (clock() > deadlineMs) { counts.deferred += 1; continue; }
    const finish = async (outcome: string, messageId: string | null, code: string | null, message: string | null) => {
      const { error } = await rpc("customer_notification_finish", {
        p_id: row.id, p_token: row.claim_token, p_outcome: outcome,
        p_provider_message_id: messageId, p_error_code: code, p_error_message: message,
      });
      if (error) throw new Error("Falha ao registrar o resultado do despacho.");
    };
    const params = Array.isArray(row.params) ? row.params.map(String) : [];
    if (!row.to_phone) { await finish("skipped", null, "sem_destinatario", "Sem WhatsApp válido."); counts.skipped += 1; continue; }
    const started = await rpc("customer_notification_mark_call_started", { p_id: row.id, p_token: row.claim_token });
    if (started.error || started.data !== true) continue; // perdeu a reivindicação: outro processo assumiu
    try {
      const sent = await send(row.template_name, row.to_phone, params);
      await finish("accepted", sent.providerMessageId, null, null);
      counts.accepted += 1;
    } catch (error) {
      const kind = failureKind(error);
      const code = (error as { code?: string }).code ?? null;
      const message = error instanceof Error ? error.message : "Falha desconhecida";
      if (kind === "retryable") { await finish("retryable", null, code, message); counts.retryable += 1; }
      else if (kind === "permanent") { await finish("failed", null, code, message); counts.failed += 1; }
      else { await finish("uncertain", null, code, message); counts.uncertain += 1; }
    }
  }
  return counts;
}

export type CycleResult = { status: "disabled" | "ok" | "error"; reason?: string; planned: number; enqueued: number; counts: Counts };

export async function runCustomerNotificationCycle(input: {
  rpc: Rpc; send: Sender; config: NotificationConfig; now: Date; providerConfigured: boolean; clock?: () => number;
}): Promise<CycleResult> {
  const { rpc, send, config, now } = input;
  const clock = input.clock ?? Date.now;
  const result = (status: CycleResult["status"], extra: Partial<CycleResult> = {}): CycleResult =>
    ({ status, planned: 0, enqueued: 0, counts: emptyCounts(), ...extra });
  if (!config.enabled || !input.providerConfigured || !config.since) return result("disabled");

  const rows: DispatchRow[] = [];
  const financeEnabled = (["new_obligation", "due_soon", "overdue", "receipt_available"] as const).some((e) => config.templates[e]);
  if (financeEnabled) {
    const { data, error } = await rpc("customer_notification_finance_candidates", {
      p_since: config.since, p_today: saoPauloDate(now),
      p_due_soon_days: config.templates.due_soon ? config.dueSoonDays : 0,
      p_overdue_offsets: config.templates.overdue ? config.overdueOffsets : [],
      p_limit: 500,
    });
    if (error) return result("error", { reason: "candidatos_financeiros_indisponiveis" });
    rows.push(...planDispatchRows((data as FinanceCandidate[]) ?? [], config));
  }
  if (config.templates.service_suspended || config.templates.service_restored) {
    const { data, error } = await rpc("customer_notification_service_candidates", { p_since: `${config.since}T00:00:00-03:00`, p_limit: 200 });
    if (error) return result("error", { reason: "candidatos_de_servico_indisponiveis" });
    rows.push(...planDispatchRows((data as ServiceCandidate[]) ?? [], config));
  }

  let enqueued = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await rpc("customer_notification_enqueue", { p_rows: rows.slice(i, i + 500) });
    if (error) return result("error", { reason: "enfileiramento_indisponivel", planned: rows.length, enqueued });
    enqueued += Number(data) || 0;
  }

  const claim = await rpc("customer_notification_claim", { p_origin: "automatic", p_limit: config.batchLimit });
  if (claim.error) return result("error", { reason: "reivindicacao_indisponivel", planned: rows.length, enqueued });
  const counts = await processClaimed(rpc, send, (claim.data as ClaimedRow[]) ?? [], clock() + config.budgetMs, clock);
  return result("ok", { planned: rows.length, enqueued, counts });
}
