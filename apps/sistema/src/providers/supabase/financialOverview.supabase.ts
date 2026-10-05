import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReceivableDueFlag } from "@ir/types";

export interface FinancialOverview {
  totalOpenAmount: number;
  totalOverdueAmount: number;
  dueSoonAmount: number;
  receivedInPeriod: number;
  adjustmentsInPeriod: number;
  openCount: number;
  partiallyPaidCount: number;
}

/**
 * Visão geral financeira (Parte 3A, item 21) — consulta real contra
 * `receivables_with_balance` + somatório de recebimentos/abatimentos
 * válidos no período, sem gráfico decorativo. Não usa fixture/mock
 * permanente — mesma regra de nunca criar dependência desnecessária
 * aplicada ao resto do módulo nesta fase (não dá pra testar contra o
 * Supabase real agora, mas o código já é o definitivo).
 */
export async function getFinancialOverviewSupabase(
  client: SupabaseClient,
  { periodStart, periodEnd }: { periodStart: string; periodEnd: string },
): Promise<FinancialOverview> {
  const [openResult, receiptsResult, adjustmentsResult] = await Promise.all([
    client
      .from("receivables_with_balance")
      .select("status, due_date, balance")
      .in("status", ["open", "partially_paid"]),
    client.from("receivable_receipts").select("amount").is("reversed_at", null).gte("received_at", periodStart).lte("received_at", periodEnd),
    client.from("receivable_adjustments").select("amount").is("reversed_at", null).gte("recorded_at", periodStart).lte("recorded_at", periodEnd),
  ]);

  if (openResult.error) throw new Error(openResult.error.message);
  if (receiptsResult.error) throw new Error(receiptsResult.error.message);
  if (adjustmentsResult.error) throw new Error(adjustmentsResult.error.message);

  const openRows = (openResult.data ?? []) as { status: "open" | "partially_paid"; due_date: string; balance: number }[];

  let totalOpenAmount = 0;
  let totalOverdueAmount = 0;
  let dueSoonAmount = 0;
  let openCount = 0;
  let partiallyPaidCount = 0;

  for (const row of openRows) {
    const balance = Number(row.balance);
    totalOpenAmount += balance;
    if (row.status === "open") openCount += 1;
    else partiallyPaidCount += 1;
    const flag = computeReceivableDueFlag(row.due_date, row.status);
    if (flag === "overdue") totalOverdueAmount += balance;
    if (flag === "due_today" || flag === "due_soon") dueSoonAmount += balance;
  }

  const receivedInPeriod = ((receiptsResult.data ?? []) as { amount: number }[]).reduce((sum, row) => sum + Number(row.amount), 0);
  const adjustmentsInPeriod = ((adjustmentsResult.data ?? []) as { amount: number }[]).reduce((sum, row) => sum + Number(row.amount), 0);

  return { totalOpenAmount, totalOverdueAmount, dueSoonAmount, receivedInPeriod, adjustmentsInPeriod, openCount, partiallyPaidCount };
}
