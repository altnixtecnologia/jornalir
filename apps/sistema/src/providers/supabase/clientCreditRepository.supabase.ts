import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientCredit, ClientCreditWithBalance, ReceivableSourceType } from "@ir/types";
import type { ApplyCreditInput, ApplyCreditResult, ClientCreditListQuery, ClientCreditRepository, ClientCreditReversalInput, NewClientCreditRecord } from "@ir/core";

const TABLE = "client_credits";
const VIEW = "client_credits_with_balance";
const COLUMNS =
  "id, client_id, source_type, subscription_id, contract_id, origin_receivable_id, origin_receipt_id, " +
  "original_amount, reason, notes, created_by, created_at, reversed_at, reversed_by, reversal_reason";
const VIEW_COLUMNS = `${COLUMNS}, total_applied, balance`;

interface ClientCreditRow {
  id: string;
  client_id: string;
  source_type: ReceivableSourceType;
  subscription_id: string | null;
  contract_id: string | null;
  origin_receivable_id: string | null;
  origin_receipt_id: string | null;
  original_amount: number;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

interface ClientCreditWithBalanceRow extends ClientCreditRow {
  total_applied: number;
  balance: number;
}

function toDomain(row: ClientCreditRow): ClientCredit {
  return {
    id: row.id,
    clientId: row.client_id,
    sourceType: row.source_type,
    subscriptionId: row.subscription_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    originReceivableId: row.origin_receivable_id ?? undefined,
    originReceiptId: row.origin_receipt_id ?? undefined,
    originalAmount: Number(row.original_amount),
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
    reversedAt: row.reversed_at ?? undefined,
    reversedByProfileId: row.reversed_by ?? undefined,
    reversalReason: row.reversal_reason ?? undefined,
  };
}

function toDomainWithBalance(row: ClientCreditWithBalanceRow): ClientCreditWithBalance {
  return {
    ...toDomain(row),
    totalApplied: Number(row.total_applied),
    balance: Number(row.balance),
  };
}

function toRow(record: NewClientCreditRecord): Record<string, unknown> {
  return {
    client_id: record.clientId,
    source_type: record.sourceType,
    subscription_id: record.subscriptionId ?? null,
    contract_id: record.contractId ?? null,
    origin_receivable_id: record.originReceivableId ?? null,
    origin_receipt_id: record.originReceiptId ?? null,
    original_amount: record.originalAmount,
    reason: record.reason ?? null,
    notes: record.notes ?? null,
    created_by: record.createdByProfileId ?? null,
  };
}

/**
 * Ledger de crédito do cliente (Parte 3B.1) — nunca um saldo mutável.
 * O saldo disponível vem sempre de `client_credits_with_balance`
 * (original_amount - aplicações válidas em receivable_adjustments,
 * mesmo princípio de receivables_with_balance).
 */
export function createClientCreditRepositorySupabase(client: SupabaseClient): ClientCreditRepository {
  return {
    async list(query: ClientCreditListQuery = {}) {
      let builder = client.from(VIEW).select(VIEW_COLUMNS).order("created_at", { ascending: true });
      if (query.clientId) builder = builder.eq("client_id", query.clientId);
      if (query.sourceType) builder = builder.eq("source_type", query.sourceType);
      if (query.subscriptionId) builder = builder.eq("subscription_id", query.subscriptionId);
      if (query.contractId) builder = builder.eq("contract_id", query.contractId);
      if (query.availableOnly) builder = builder.is("reversed_at", null).gt("balance", 0);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomainWithBalance(row as unknown as ClientCreditWithBalanceRow));
    },

    async getById(id) {
      const { data, error } = await client.from(VIEW).select(VIEW_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomainWithBalance(data as unknown as ClientCreditWithBalanceRow) : null;
    },

    async create(record) {
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ClientCreditRow);
    },

    async reverse(id: string, reversal: ClientCreditReversalInput) {
      const { data, error } = await client
        .from(TABLE)
        .update({
          reversed_at: new Date().toISOString(),
          reversed_by: reversal.reversedByProfileId,
          reversal_reason: reversal.reversalReason,
        })
        .eq("id", id)
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ClientCreditRow);
    },

    async applyToReceivable(input: ApplyCreditInput): Promise<ApplyCreditResult> {
      const { data, error } = await client
        .rpc("apply_client_credit", {
          p_credit_id: input.creditId,
          p_receivable_id: input.receivableId,
          p_requested_amount: input.requestedAmount,
          p_reason: input.reason,
          p_authorized_by: input.authorizedByProfileId ?? null,
        })
        .single();
      if (error) throw new Error(error.message);
      const row = data as unknown as {
        applied_amount: number;
        credit_remaining: number;
        receivable_balance: number;
        receivable_status: string;
      };
      return {
        appliedAmount: Number(row.applied_amount),
        creditRemaining: Number(row.credit_remaining),
        receivableBalance: Number(row.receivable_balance),
        receivableStatus: row.receivable_status,
      };
    },
  };
}
