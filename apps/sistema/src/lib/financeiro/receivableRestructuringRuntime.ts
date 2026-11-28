import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentChargeService } from "../../composition/financeiro";
import { recordAuditEventSupabase } from "../../providers/supabase/auditEvents.supabase";
import { notifyAltnixReceivableCommit } from "../integrations/altnixReceivableEvent";
import { todayInSaoPauloISO } from "../date/saoPauloDate";
import { runRestructuring, type LoadSourcesResult, type RestructureCommand, type RestructureDeps, type RestructureOutcome, type SourceRow } from "./receivableRestructuring";

const SAFE_DB_CODES = new Set(["22023", "42501", "23505", "23514"]);

const toCents = (value: unknown): number => Math.round(Number(value) * 100);

/** Leitura em lote (4 consultas + títulos), sem chamar o Asaas. Valida elegibilidade e composição provada. */
export async function loadRestructureSources(admin: SupabaseClient, ids: string[]): Promise<LoadSourcesResult> {
  const { data: rows, error } = await admin.from("receivables")
    .select("id, internal_reference, client_id, source_type, status, original_amount, due_date, commercial_sale_id, report_excluded_at")
    .in("id", ids);
  if (error) return { ok: false, error: "Consulta financeira indisponível. Tente novamente." };
  if ((rows ?? []).length !== ids.length) return { ok: false, error: "Alguma cobrança selecionada não foi encontrada." };
  if (new Set(rows!.map((r) => r.client_id as string)).size !== 1) return { ok: false, error: "Cobranças de clientes diferentes não podem ser reestruturadas juntas." };
  for (const r of rows!) {
    if (r.source_type !== "advertising" || r.status !== "open" || toCents(r.original_amount) <= 0 || r.report_excluded_at)
      return { ok: false, error: `A cobrança ${r.internal_reference} não está elegível (somente publicidade em aberto e não classificada como teste).` };
  }
  const [receipts, adjustments, restructured] = await Promise.all([
    admin.from("receivable_receipts").select("receivable_id").in("receivable_id", ids).limit(1),
    admin.from("receivable_adjustments").select("receivable_id").in("receivable_id", ids).limit(1),
    admin.from("receivable_restructuring_links").select("receivable_id").eq("role", "source").in("receivable_id", ids).limit(1),
  ]);
  if (receipts.error || adjustments.error || restructured.error) return { ok: false, error: "Consulta financeira indisponível. Tente novamente." };
  if ((receipts.data ?? []).length || (adjustments.data ?? []).length)
    return { ok: false, error: "Há recebimento ou abatimento em uma das cobranças. Concilie o histórico antes de reestruturar." };
  if ((restructured.data ?? []).length) return { ok: false, error: "Uma das cobranças já foi substituída por outra reestruturação." };

  // Composição por serviço: garante a alocação das compras de origem (idempotente, sem tocar o Asaas).
  for (const saleId of new Set(rows!.map((r) => r.commercial_sale_id as string | null).filter((v): v is string => Boolean(v)))) {
    const { error: allocError } = await admin.rpc("altnix_allocate_sale_receivables", { p_sale: saleId });
    if (allocError) return { ok: false, error: "Composição por serviço indisponível. Tente novamente." };
  }
  const { data: allocations, error: allocationsError } = await admin.from("receivable_service_allocations")
    .select("receivable_id, service_id, allocated_cents").in("receivable_id", ids);
  if (allocationsError) return { ok: false, error: "Consulta financeira indisponível. Tente novamente." };
  const serviceIds = [...new Set((allocations ?? []).map((a) => a.service_id as string))];
  const saleIds = [...new Set(rows!.map((r) => r.commercial_sale_id as string | null).filter((v): v is string => Boolean(v)))];
  const [services, sales] = await Promise.all([
    serviceIds.length ? admin.from("commercial_contract_services").select("id, service_title").in("id", serviceIds) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? admin.from("commercial_sales").select("id, internal_reference").in("id", saleIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (services.error || sales.error) return { ok: false, error: "Consulta financeira indisponível. Tente novamente." };
  const titles = new Map((services.data ?? []).map((s) => [s.id as string, String(s.service_title)]));
  const saleRef = new Map((sales.data ?? []).map((s) => [s.id as string, String(s.internal_reference)]));

  const sources: SourceRow[] = rows!.map((r) => {
    const lines = (allocations ?? []).filter((a) => a.receivable_id === r.id).map((a) => ({ serviceId: a.service_id as string, cents: Number(a.allocated_cents) }));
    return {
      id: r.id as string, clientId: r.client_id as string, outstandingCents: toCents(r.original_amount), allocations: lines,
      reference: String(r.internal_reference), dueDate: String(r.due_date),
      purchaseLabel: r.commercial_sale_id ? `Compra ${saleRef.get(r.commercial_sale_id as string) ?? ""}`.trim() : `Cobrança ${r.internal_reference}`,
      serviceTitles: Object.fromEntries(lines.map((l) => [l.serviceId, titles.get(l.serviceId) ?? "Serviço"])),
    };
  });
  return { ok: true, sources };
}

export function buildRestructureDeps(admin: SupabaseClient, actorId: string): RestructureDeps {
  const charges = getPaymentChargeService(admin);
  return {
    today: todayInSaoPauloISO(),
    loadSources: (ids) => loadRestructureSources(admin, ids),
    charges: {
      inspect: (id) => charges.inspectChargeForRestructuring(id),
      supersede: (id) => charges.supersedeActiveCharge(id, { cancelledByProfileId: actorId, reason: "reestruturacao_administrativa" }),
    },
    async restructure(args) {
      const { data, error } = await admin.rpc("restructure_receivables", {
        p_operation: args.operationId, p_kind: args.kind, p_sources: args.sources, p_reason: args.reason, p_actor: actorId,
        p_targets: args.targets.map((t) => ({ dueDate: t.dueDate, description: t.description, allocations: t.allocations })),
      });
      if (error) {
        const code = (error as { code?: string }).code ?? "";
        return { ok: false as const, error: SAFE_DB_CODES.has(code) ? error.message : "Não foi possível reestruturar agora. Nada foi alterado." };
      }
      const result = data as { restructuringId?: string; targetIds?: string[]; replayed?: boolean } | null;
      if (!result?.restructuringId || !Array.isArray(result.targetIds)) return { ok: false as const, error: "Resposta inesperada do financeiro." };
      return { ok: true as const, restructuringId: result.restructuringId, targetIds: result.targetIds, replayed: result.replayed === true };
    },
    reassess: (ids) => notifyAltnixReceivableCommit(ids),
    audit: (event) => recordAuditEventSupabase(admin, { userId: actorId, entityType: "receivable_restructuring", entityId: event.entityId, action: event.action, metadata: event.metadata }),
  };
}

export async function executeRestructuring(admin: SupabaseClient, actorId: string, command: RestructureCommand): Promise<RestructureOutcome> {
  return runRestructuring(command, buildRestructureDeps(admin, actorId));
}
