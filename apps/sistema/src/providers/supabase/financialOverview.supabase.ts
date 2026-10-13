import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReceivableDueFlag } from "@ir/types";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";
import { PREVIEW_RECEIPTS, PREVIEW_RECEIVABLES } from "./receivableRepository.supabase";

export interface FinancialPeriodMetric {
  amount: number;
  count: number;
}

export interface FinancialOverview {
  dueToday: FinancialPeriodMetric;
  duePeriod: FinancialPeriodMetric;
  dueMonth: FinancialPeriodMetric;
  receivedToday: FinancialPeriodMetric;
  receivedPeriod: FinancialPeriodMetric;
  receivedMonth: FinancialPeriodMetric;
  openToday: FinancialPeriodMetric;
  openPeriod: FinancialPeriodMetric;
  openMonth: FinancialPeriodMetric;
  totalOpenAmount: number;
  totalOverdueAmount: number;
  overdueCount: number;
  adjustmentsInPeriod: number;
  partiallyPaidCount: number;
}

interface OverviewRange {
  today: string;
  periodStart: string;
  periodEnd: string;
  monthStart: string;
  monthEnd: string;
}

interface OpenRow {
  status: "open" | "partially_paid";
  due_date: string;
  balance: number;
}

interface ReceiptRow {
  amount: number;
  received_at: string;
}

function inRange(value: string, start: string, end: string): boolean {
  const date = value.slice(0, 10);
  return date >= start && date <= end;
}

function metricFromOpen(rows: OpenRow[], start: string, end: string): FinancialPeriodMetric {
  const matched = rows.filter((row) => inRange(row.due_date, start, end));
  return {
    amount: matched.reduce((sum, row) => sum + Number(row.balance), 0),
    count: matched.length,
  };
}

function metricFromReceipts(rows: ReceiptRow[], start: string, end: string): FinancialPeriodMetric {
  const matched = rows.filter((row) => inRange(row.received_at, start, end));
  return {
    amount: matched.reduce((sum, row) => sum + Number(row.amount), 0),
    count: matched.length,
  };
}

function minDate(...values: string[]): string {
  return [...values].sort()[0];
}

function maxDate(...values: string[]): string {
  return [...values].sort().at(-1) as string;
}

/**
 * Visão geral financeira com três recortes simultâneos:
 * - hoje;
 * - período escolhido pelo operador;
 * - mês corrente.
 *
 * Para vencimentos e títulos em aberto consideramos somente o saldo ainda
 * aberto/parcial, nunca títulos já quitados/cancelados. Recebidos usam
 * recebimentos válidos (não estornados).
 */
export async function getFinancialOverviewSupabase(
  client: SupabaseClient,
  range: OverviewRange,
): Promise<FinancialOverview> {
  if (isLocalPreviewEnabled()) {
    const openRows: OpenRow[] = PREVIEW_RECEIVABLES
      .filter((receivable) => receivable.status === "open" || receivable.status === "partially_paid")
      .map((receivable) => ({
        status: receivable.status as "open" | "partially_paid",
        due_date: receivable.dueDate,
        balance: receivable.balance,
      }));

    const receiptRows: ReceiptRow[] = PREVIEW_RECEIPTS.map((receipt) => ({
      amount: receipt.amount,
      received_at: receipt.receivedAt,
    }));

    let totalOpenAmount = 0;
    let totalOverdueAmount = 0;
    let overdueCount = 0;
    let partiallyPaidCount = 0;

    for (const row of openRows) {
      totalOpenAmount += Number(row.balance);
      if (row.status === "partially_paid") partiallyPaidCount += 1;
      if (computeReceivableDueFlag(row.due_date, row.status) === "overdue") {
        totalOverdueAmount += Number(row.balance);
        overdueCount += 1;
      }
    }

    const dueToday = metricFromOpen(openRows, range.today, range.today);
    const duePeriod = metricFromOpen(openRows, range.periodStart, range.periodEnd);
    const dueMonth = metricFromOpen(openRows, range.monthStart, range.monthEnd);

    return {
      dueToday,
      duePeriod,
      dueMonth,
      receivedToday: metricFromReceipts(receiptRows, range.today, range.today),
      receivedPeriod: metricFromReceipts(receiptRows, range.periodStart, range.periodEnd),
      receivedMonth: metricFromReceipts(receiptRows, range.monthStart, range.monthEnd),
      openToday: dueToday,
      openPeriod: duePeriod,
      openMonth: dueMonth,
      totalOpenAmount,
      totalOverdueAmount,
      overdueCount,
      adjustmentsInPeriod: 0,
      partiallyPaidCount,
    };
  }

  const receiptQueryStart = minDate(range.today, range.periodStart, range.monthStart);
  const receiptQueryEnd = maxDate(range.today, range.periodEnd, range.monthEnd);

  const [openResult, receiptsResult, adjustmentsResult] = await Promise.all([
    client
      .from("receivables_with_balance")
      .select("status, due_date, balance")
      .in("status", ["open", "partially_paid"]),
    client
      .from("receivable_receipts")
      .select("amount, received_at")
      .is("reversed_at", null)
      .gte("received_at", receiptQueryStart)
      .lte("received_at", receiptQueryEnd),
    client
      .from("receivable_adjustments")
      .select("amount")
      .is("reversed_at", null)
      .gte("recorded_at", `${range.periodStart}T00:00:00`)
      .lte("recorded_at", `${range.periodEnd}T23:59:59.999`),
  ]);

  if (openResult.error) throw new Error(openResult.error.message);
  if (receiptsResult.error) throw new Error(receiptsResult.error.message);
  if (adjustmentsResult.error) throw new Error(adjustmentsResult.error.message);

  const openRows = (openResult.data ?? []).map((row) => ({
    status: row.status as "open" | "partially_paid",
    due_date: String(row.due_date),
    balance: Number(row.balance),
  }));

  const receiptRows = (receiptsResult.data ?? []).map((row) => ({
    amount: Number(row.amount),
    received_at: String(row.received_at),
  }));

  let totalOpenAmount = 0;
  let totalOverdueAmount = 0;
  let overdueCount = 0;
  let partiallyPaidCount = 0;

  for (const row of openRows) {
    totalOpenAmount += row.balance;
    if (row.status === "partially_paid") partiallyPaidCount += 1;
    if (computeReceivableDueFlag(row.due_date, row.status) === "overdue") {
      totalOverdueAmount += row.balance;
      overdueCount += 1;
    }
  }

  const dueToday = metricFromOpen(openRows, range.today, range.today);
  const duePeriod = metricFromOpen(openRows, range.periodStart, range.periodEnd);
  const dueMonth = metricFromOpen(openRows, range.monthStart, range.monthEnd);
  const adjustmentsInPeriod = ((adjustmentsResult.data ?? []) as { amount: number }[])
    .reduce((sum, row) => sum + Number(row.amount), 0);

  return {
    dueToday,
    duePeriod,
    dueMonth,
    receivedToday: metricFromReceipts(receiptRows, range.today, range.today),
    receivedPeriod: metricFromReceipts(receiptRows, range.periodStart, range.periodEnd),
    receivedMonth: metricFromReceipts(receiptRows, range.monthStart, range.monthEnd),
    openToday: dueToday,
    openPeriod: duePeriod,
    openMonth: dueMonth,
    totalOpenAmount,
    totalOverdueAmount,
    overdueCount,
    adjustmentsInPeriod,
    partiallyPaidCount,
  };
}
