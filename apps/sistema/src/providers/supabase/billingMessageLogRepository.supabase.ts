import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingMessageChannel, BillingMessageLog, BillingMessageStatus } from "@ir/types";
import type { BillingMessageRepository, NewBillingMessageLogRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "billing_message_logs";
const COLUMNS = "id, receivable_id, client_id, channel, to_phone, message, status, provider_message_id, error_message, created_by, created_at";

interface BillingMessageLogRow {
  id: string;
  receivable_id: string;
  client_id: string;
  channel: BillingMessageChannel;
  to_phone: string;
  message: string;
  status: BillingMessageStatus;
  provider_message_id: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
}

function toDomain(row: BillingMessageLogRow): BillingMessageLog {
  return {
    id: row.id,
    receivableId: row.receivable_id,
    clientId: row.client_id,
    channel: row.channel,
    toPhone: row.to_phone,
    message: row.message,
    status: row.status,
    providerMessageId: row.provider_message_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

// Preview — em memória só pela duração do processo, mesmo princípio de paymentChargeRepository.supabase.ts.
const previewLogs: BillingMessageLog[] = [];

export function createBillingMessageLogRepositorySupabase(client: SupabaseClient): BillingMessageRepository {
  return {
    async listForReceivable(receivableId) {
      if (isLocalPreviewEnabled()) return previewLogs.filter((log) => log.receivableId === receivableId);
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("receivable_id", receivableId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as BillingMessageLogRow));
    },

    async create(record: NewBillingMessageLogRecord) {
      if (isLocalPreviewEnabled()) {
        const log: BillingMessageLog = { ...record, id: `preview-msg-log-${Date.now()}`, createdAt: new Date().toISOString() };
        previewLogs.push(log);
        return log;
      }
      const { data, error } = await client
        .from(TABLE)
        .insert({
          receivable_id: record.receivableId,
          client_id: record.clientId,
          channel: record.channel,
          to_phone: record.toPhone,
          message: record.message,
          status: record.status,
          provider_message_id: record.providerMessageId ?? null,
          error_message: record.errorMessage ?? null,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as BillingMessageLogRow);
    },
  };
}
