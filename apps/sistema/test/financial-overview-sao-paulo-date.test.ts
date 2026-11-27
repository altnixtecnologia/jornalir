import test from "node:test";
import assert from "node:assert/strict";
import { computeReceivableDueFlag, saoPauloCivilDate } from "@ir/types";
import {
  nextCalendarDayISO,
  saoPauloDayOfTimestamp,
  saoPauloDayStartUtcISO,
} from "../src/lib/date/saoPauloDate";
import { getFinancialOverviewSupabase } from "../src/providers/supabase/financialOverview.supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

test("registro noturno no Brasil fica no dia 12 apesar de ser dia 13 em UTC", () => {
  const receiptAt = "2026-10-13T01:30:00.000Z";
  assert.equal(saoPauloCivilDate(receiptAt), "2026-10-12");
  assert.equal(saoPauloDayOfTimestamp(receiptAt), "2026-10-12");
  assert.equal(saoPauloDayStartUtcISO("2026-10-12"), "2026-10-12T03:00:00.000Z");
  assert.equal(saoPauloDayStartUtcISO("2026-10-13"), "2026-10-13T03:00:00.000Z");
  assert.equal(nextCalendarDayISO("2026-12-31"), "2027-01-01");
});

test("limites respeitam o calendário do Brasil e rejeitam datas inexistentes", () => {
  assert.equal(saoPauloDayStartUtcISO("2026-01-01"), "2026-01-01T03:00:00.000Z");
  assert.equal(saoPauloDayStartUtcISO("2025-06-01"), "2025-06-01T03:00:00.000Z");
  assert.throws(() => saoPauloDayStartUtcISO("2026-02-30"));
  assert.throws(() => nextCalendarDayISO("2026-13-01"));
});

test("vencimento só passa a vencido quando começa o dia no Brasil", () => {
  const beforeMidnight = new Date("2026-11-20T02:59:59.000Z"); // 19/11 23:59h
  const afterMidnight = new Date("2026-11-20T03:00:00.000Z"); // 20/11 00:00h
  assert.equal(computeReceivableDueFlag("2026-11-19", "open", beforeMidnight), "due_today");
  assert.equal(computeReceivableDueFlag("2026-11-19", "open", afterMidnight), "overdue");
  assert.equal(computeReceivableDueFlag("2026-11-20", "partially_paid", afterMidnight), "due_today");
  assert.equal(computeReceivableDueFlag("2026-11-19", "paid", afterMidnight), null);
  assert.equal(computeReceivableDueFlag("2026-11-19", "cancelled", afterMidnight), null);
  assert.equal(computeReceivableDueFlag("2026-11-27", "open", afterMidnight), "due_soon");
  assert.equal(computeReceivableDueFlag("2026-11-28", "open", afterMidnight), null);
});

type MockTableRow = Record<string, unknown>;
function mockFinancialDatabase(tables: Record<string, MockTableRow[]>) {
  const calls: Array<{ table: string; field: string; op: string; value: unknown }> = [];
  const client = {
    from(table: string) {
      const filters: Array<{ field: string; op: string; value: unknown }> = [];
      const query = {
        select(_columns: string) { return query; },
        in(field: string, values: string[]) { filters.push({ field, op: "in", value: values }); return query; },
        is(field: string, value: unknown) { filters.push({ field, op: "is", value }); return query; },
        gte(field: string, value: string) { filters.push({ field, op: "gte", value }); return query; },
        lt(field: string, value: string) { filters.push({ field, op: "lt", value }); return query; },
        not(field: string, op: string, value: unknown) { filters.push({ field, op: `not_${op}`, value }); return query; },
        limit(_count: number) { return query; },
        then(resolve: (value: { data: MockTableRow[]; error: null }) => unknown,
          reject?: (error: unknown) => unknown) {
          for (const filter of filters) calls.push({ table, ...filter });
          const data = (tables[table] ?? []).filter((row) => filters.every((f) => {
            if (f.op === "in") return (f.value as string[]).includes(String(row[f.field]));
            if (f.op === "is") return row[f.field] === f.value;
            if (f.op === "gte") return String(row[f.field]) >= String(f.value);
            if (f.op === "lt") return String(row[f.field]) < String(f.value);
            if (f.op === "not_is") return f.value === null ? row[f.field] != null : row[f.field] !== f.value;
            if (f.op === "not_in") return !String(f.value).replace(/^\(|\)$/g, "").split(",").includes(String(row[f.field]));
            return false;
          }));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test("Resumo financeiro: recebimentos e abatimentos de 22:30h entram em 12/10, não 13/10", async () => {
  const { client, calls } = mockFinancialDatabase({
    receivables_with_balance: [{ status: "open", due_date: "2026-10-12", balance: 100 }],
    receivable_receipts: [
      { amount: 80, received_at: "2026-10-13T01:30:00.000Z", reversed_at: null }, // 12/10 22:30h
      { amount: 20, received_at: "2026-10-12T03:00:00.000Z", reversed_at: null }, // 12/10 00:00h
      { amount: 12, received_at: "2026-10-13T03:00:00.000Z", reversed_at: null }, // 13/10 00:00h
      { amount: 99, received_at: "2026-10-13T01:00:00.000Z", reversed_at: "2026-10-15T00:00:00.000Z" }, // estornado
    ],
    receivable_adjustments: [
      { amount: 9, recorded_at: "2026-10-13T02:30:00.000Z", reversed_at: null }, // 12/10 23:30h
      { amount: 5, recorded_at: "2026-10-13T03:00:00.000Z", reversed_at: null }, // 13/10 00:00h
    ],
  });
  const report = await getFinancialOverviewSupabase(client, {
    today: "2026-10-12",
    periodStart: "2026-10-12",
    periodEnd: "2026-10-12",
    monthStart: "2026-10-01",
    monthEnd: "2026-10-31",
  });
  assert.deepEqual(report.receivedToday, { amount: 100, count: 2 });
  assert.deepEqual(report.receivedPeriod, { amount: 100, count: 2 });
  assert.deepEqual(report.receivedMonth, { amount: 112, count: 3 });
  assert.equal(report.adjustmentsInPeriod, 9);
  assert.deepEqual(report.dueToday, { amount: 100, count: 1 });
  assert.ok(calls.some((c) => c.table === "receivable_receipts" && c.op === "gte"
    && c.value === "2026-10-01T03:00:00.000Z"));
  assert.ok(calls.some((c) => c.table === "receivable_receipts" && c.op === "lt"
    && c.value === "2026-11-01T03:00:00.000Z"));
  assert.ok(calls.some((c) => c.table === "receivable_adjustments" && c.op === "gte"
    && c.value === "2026-10-12T03:00:00.000Z"));
  assert.ok(calls.some((c) => c.table === "receivable_adjustments" && c.op === "lt"
    && c.value === "2026-10-13T03:00:00.000Z"));
});

test("Resumo financeiro: título classificado como teste fica fora de abertos, recebimentos e ajustes", async () => {
  const { client } = mockFinancialDatabase({
    receivables: [{ id: "teste-1", report_excluded_at: "2026-11-27T12:00:00.000Z" }, { id: "real-1", report_excluded_at: null }],
    receivables_with_balance: [
      { id: "teste-1", status: "open", due_date: "2026-10-12", balance: 5 },
      { id: "real-1", status: "open", due_date: "2026-10-12", balance: 100 },
    ],
    receivable_receipts: [
      { receivable_id: "teste-1", amount: 5, received_at: "2026-10-12T12:00:00.000Z", reversed_at: null },
      { receivable_id: "real-1", amount: 40, received_at: "2026-10-12T12:00:00.000Z", reversed_at: null },
    ],
    receivable_adjustments: [
      { receivable_id: "teste-1", amount: 3, recorded_at: "2026-10-12T12:00:00.000Z", reversed_at: null },
      { receivable_id: "real-1", amount: 7, recorded_at: "2026-10-12T12:00:00.000Z", reversed_at: null },
    ],
  });
  const report = await getFinancialOverviewSupabase(client, {
    today: "2026-10-12", periodStart: "2026-10-12", periodEnd: "2026-10-12", monthStart: "2026-10-01", monthEnd: "2026-10-31",
  });
  assert.deepEqual(report.dueToday, { amount: 100, count: 1 });
  assert.deepEqual(report.receivedToday, { amount: 40, count: 1 });
  assert.equal(report.adjustmentsInPeriod, 7);
});
