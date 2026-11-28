import type { SupabaseClient } from "@supabase/supabase-js";
import { assessServiceObligations, type ServiceObligation } from "@ir/core";

/**
 * Leitura (RLS de equipe financeira) da composição de cobrança por compra: quais títulos pagam quais serviços.
 * Valores em centavos inteiros. Pagamento parcial NÃO é rateado entre serviços: um título com saldo mantém em
 * aberto todos os serviços nele alocados. Sem consulta ao Asaas e sem escrita.
 */

export type CompositionService = { serviceId: string; title: string; cents: number };
export type CompositionReceivable = {
  id: string; reference: string; dueDate: string; status: "open" | "partially_paid" | "paid" | "cancelled";
  originalCents: number; paidCents: number; balanceCents: number;
  /** Título criado por reestruturação (substituto) ou substituído por ela (cancelado, preservado como histórico). */
  replacement: boolean; superseded: boolean; excluded: boolean;
  services: CompositionService[];
};
export type CompositionServiceRow = {
  serviceId: string; title: string; valueCents: number; paidCents: number; outstandingCents: number; oldestDue: string | null;
  financialState: "paid" | "current" | "overdue" | "unproven" | "no_charge";
};
export type SaleComposition = { receivables: CompositionReceivable[]; services: CompositionServiceRow[]; complete: boolean };

const cents = (v: unknown) => Math.round(Number(v) * 100);

export async function loadSaleBillingComposition(client: SupabaseClient, saleId: string, today: string): Promise<SaleComposition> {
  const empty: SaleComposition = { receivables: [], services: [], complete: false };
  const { data: serviceRows, error: serviceError } = await client.from("commercial_contract_services")
    .select("id, service_title, item_ordinal, commercial_contract_packages!inner(commercial_sale_id)")
    .eq("commercial_contract_packages.commercial_sale_id", saleId).order("item_ordinal");
  if (serviceError) return empty;
  const services = (serviceRows ?? []).map((s) => ({ id: s.id as string, title: String(s.service_title) }));
  const { data: sale } = await client.from("commercial_sales").select("items_snapshot").eq("id", saleId).maybeSingle();
  const items = Array.isArray(sale?.items_snapshot) ? (sale!.items_snapshot as Array<{ totalAmount?: unknown }>) : [];
  const ordinals = new Map((serviceRows ?? []).map((s) => [s.id as string, Number(s.item_ordinal)]));
  if (services.length === 0) return empty;

  const { data: allocations, error: allocError } = await client.from("receivable_service_allocations")
    .select("receivable_id, service_id, allocated_cents").in("service_id", services.map((s) => s.id));
  if (allocError) return empty;
  const ids = [...new Set((allocations ?? []).map((a) => a.receivable_id as string))];
  if (ids.length === 0) {
    return { receivables: [], services: services.map((s) => ({ serviceId: s.id, title: s.title, valueCents: cents(items[ordinals.get(s.id) ?? -1]?.totalAmount ?? 0), paidCents: 0, outstandingCents: 0, oldestDue: null, financialState: "no_charge" as const })), complete: true };
  }
  const [{ data: rows, error: rowsError }, { data: links }] = await Promise.all([
    client.from("receivables_with_balance").select("id, internal_reference, due_date, status, original_amount, total_received, balance").in("id", ids),
    client.from("receivable_restructuring_links").select("receivable_id, role").in("receivable_id", ids),
  ]);
  if (rowsError) return empty;
  const excluded = new Set<string>();
  const { data: flags } = await client.from("receivables").select("id, report_excluded_at, restructuring_id").in("id", ids);
  const replacement = new Set<string>();
  for (const f of flags ?? []) { if (f.report_excluded_at) excluded.add(f.id as string); if (f.restructuring_id) replacement.add(f.id as string); }
  const superseded = new Set((links ?? []).filter((l) => l.role === "source").map((l) => l.receivable_id as string));
  const titleOf = new Map(services.map((s) => [s.id, s.title]));

  const receivables: CompositionReceivable[] = (rows ?? []).map((r) => ({
    id: r.id as string, reference: String(r.internal_reference), dueDate: String(r.due_date), status: r.status as CompositionReceivable["status"],
    originalCents: cents(r.original_amount), paidCents: cents(r.total_received), balanceCents: cents(r.balance),
    replacement: replacement.has(r.id as string), superseded: superseded.has(r.id as string), excluded: excluded.has(r.id as string),
    services: (allocations ?? []).filter((a) => a.receivable_id === r.id).map((a) => ({ serviceId: a.service_id as string, title: titleOf.get(a.service_id as string) ?? "Serviço", cents: Number(a.allocated_cents) })),
  })).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference));

  const rowsByService: CompositionServiceRow[] = services.map((s) => {
    const valueCents = cents(items[ordinals.get(s.id) ?? -1]?.totalAmount ?? 0);
    const obligations: ServiceObligation[] = receivables.flatMap((r) => r.services.filter((l) => l.serviceId === s.id).map((l) => ({
      receivableId: r.id, allocatedCents: l.cents, dueDate: r.dueDate, balanceCents: r.balanceCents, status: r.status, excludedFromReports: r.excluded,
    })));
    const live = obligations.filter((o) => o.status !== "cancelled");
    const paidCents = live.filter((o) => o.balanceCents === 0).reduce((a, o) => a + o.allocatedCents, 0);
    const outstandingCents = live.filter((o) => o.balanceCents > 0).reduce((a, o) => a + o.allocatedCents, 0);
    // Estado financeiro sem tolerância (só leitura): a política de suspensão é avaliada no banco.
    const verdict = valueCents === 0 ? { state: "authorized" as const, oldestDue: undefined } : assessServiceObligations({ serviceCents: valueCents, obligations, today, graceDays: 0 });
    const financialState: CompositionServiceRow["financialState"] = valueCents === 0 ? "paid"
      : live.length === 0 ? "no_charge"
      : verdict.state === "review" ? "unproven"
      : outstandingCents === 0 ? "paid"
      : verdict.state === "authorized" ? "current" : "overdue";
    return { serviceId: s.id, title: s.title, valueCents, paidCents, outstandingCents, oldestDue: verdict.oldestDue ?? null, financialState };
  });
  return { receivables, services: rowsByService, complete: true };
}

/**
 * Situação financeira da compra após reestruturação: quando os títulos de uma compra foram substituídos (cancelados,
 * preservados), os substitutos (sem commercial_sale_id) passam a representá-la. Uma consulta extra, SOMENTE quando há
 * título cancelado entre os da compra; antes da migration ou em erro, devolve vazio (comportamento anterior).
 */
export async function loadRestructuredSummariesBySale(
  client: SupabaseClient, receivables: ReadonlyArray<{ id: string; status: string; commercialSaleId?: string | null }>,
): Promise<Map<string, Array<{ status: "open" | "partially_paid" | "paid" | "cancelled"; dueDate: string }>>> {
  const out = new Map<string, Array<{ status: "open" | "partially_paid" | "paid" | "cancelled"; dueDate: string }>>();
  const cancelled = receivables.filter((r) => r.status === "cancelled" && r.commercialSaleId);
  if (cancelled.length === 0) return out;
  const { data: links, error } = await client.from("receivable_restructuring_links").select("restructuring_id, receivable_id").eq("role", "source").in("receivable_id", cancelled.map((r) => r.id));
  if (error || !links?.length) return out;
  const restructuringIds = [...new Set(links.map((l) => l.restructuring_id as string))];
  const { data: targets, error: targetError } = await client.from("receivables").select("id, status, due_date, restructuring_id").in("restructuring_id", restructuringIds);
  if (targetError) return out;
  const saleOfSource = new Map(cancelled.map((r) => [r.id, r.commercialSaleId as string]));
  const salesByRestructuring = new Map<string, Set<string>>();
  for (const l of links) {
    const set = salesByRestructuring.get(l.restructuring_id as string) ?? new Set<string>();
    const sale = saleOfSource.get(l.receivable_id as string);
    if (sale) set.add(sale);
    salesByRestructuring.set(l.restructuring_id as string, set);
  }
  for (const t of targets ?? []) {
    for (const sale of salesByRestructuring.get(t.restructuring_id as string) ?? []) {
      const list = out.get(sale) ?? [];
      list.push({ status: t.status as "open" | "partially_paid" | "paid" | "cancelled", dueDate: String(t.due_date) });
      out.set(sale, list);
    }
  }
  return out;
}

export type RestructurableReceivable = {
  id: string; reference: string; dueDate: string; cents: number; purchaseLabel: string; services: string[];
};

/** Títulos do cliente que PODEM ser reestruturados (publicidade, em aberto, sem histórico, com composição comprovada). */
export async function loadRestructurableReceivables(client: SupabaseClient, clientId: string): Promise<RestructurableReceivable[]> {
  const { data: rows, error } = await client.from("receivables_with_balance")
    .select("id, internal_reference, due_date, status, source_type, original_amount, total_received, total_adjustments, commercial_sale_id")
    .eq("client_id", clientId).eq("status", "open").eq("source_type", "advertising").eq("total_received", 0).eq("total_adjustments", 0)
    .order("due_date").limit(100);
  if (error || !rows?.length) return [];
  const ids = rows.map((r) => r.id as string);
  const [{ data: flags }, { data: allocations }, { data: links }] = await Promise.all([
    client.from("receivables").select("id, report_excluded_at").in("id", ids),
    client.from("receivable_service_allocations").select("receivable_id, service_id, allocated_cents").in("receivable_id", ids),
    client.from("receivable_restructuring_links").select("receivable_id").eq("role", "source").in("receivable_id", ids),
  ]);
  const excluded = new Set((flags ?? []).filter((f) => f.report_excluded_at).map((f) => f.id as string));
  const done = new Set((links ?? []).map((l) => l.receivable_id as string));
  const serviceIds = [...new Set((allocations ?? []).map((a) => a.service_id as string))];
  const { data: services } = serviceIds.length ? await client.from("commercial_contract_services").select("id, service_title").in("id", serviceIds) : { data: [] };
  const title = new Map((services ?? []).map((s) => [s.id as string, String(s.service_title)]));
  const saleIds = [...new Set(rows.map((r) => r.commercial_sale_id as string | null).filter((v): v is string => Boolean(v)))];
  const { data: sales } = saleIds.length ? await client.from("commercial_sales").select("id, internal_reference").in("id", saleIds) : { data: [] };
  const saleRef = new Map((sales ?? []).map((s) => [s.id as string, String(s.internal_reference)]));
  return rows.filter((r) => !excluded.has(r.id as string) && !done.has(r.id as string)).flatMap((r) => {
    const mine = (allocations ?? []).filter((a) => a.receivable_id === r.id);
    // Só títulos com composição comprovada (soma == valor): nunca reestruturar no escuro.
    if (!mine.length || mine.reduce((acc, a) => acc + Number(a.allocated_cents), 0) !== cents(r.original_amount)) return [];
    return [{
      id: r.id as string, reference: String(r.internal_reference), dueDate: String(r.due_date), cents: cents(r.original_amount),
      purchaseLabel: r.commercial_sale_id ? `Compra ${saleRef.get(r.commercial_sale_id as string) ?? ""}`.trim() : `Cobrança ${r.internal_reference}`,
      services: mine.map((a) => title.get(a.service_id as string) ?? "Serviço"),
    }];
  });
}
