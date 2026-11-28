import {
  planConsolidation, planSplit, validateRestructuring, RestructureValidationError,
  type PaymentTerms, type RestructureSource, type RestructureTarget, type SplitMode,
} from "@ir/core";

/**
 * Orquestração da reestruturação administrativa (unificar / dividir cobranças), sem I/O próprio:
 * tudo externo entra por `RestructureDeps`, o que permite provar concorrência, cobrança externa ativa,
 * timeout e conservação com simulações. Ordem (sem pretender atomicidade com o Asaas):
 *
 *   autorizar operador (ação do servidor) → validar estado financeiro atual → identificar cobrança ativa
 *   → inspeção LOCAL prévia (nada é cancelado se alguma cobrança já está paga/confirmada/ambígua)
 *   → cancelar cada cobrança com PROVA (PaymentChargeService.supersedeActiveCharge)
 *   → RPC atômica (revalida sob lock, conserva centavos por serviço, preserva linhagem) → auditoria
 *   → reavaliação event-driven dos serviços afetados.
 *
 * Se uma cobrança não puder ser cancelada com segurança, a reestruturação é RECUSADA e os títulos seguem como
 * estavam (cobranças já canceladas com prova antes da recusa ficam canceladas; o cliente pode gerar nova).
 * Nada cria cobrança substituta aqui: o cliente/operador escolhe a forma depois, no fluxo existente.
 */

export type RestructureCommand = {
  operationId: string;
  kind: "consolidate" | "split";
  sourceIds: string[];
  splitMode?: SplitMode;
  terms: PaymentTerms;
  description: string;
  reason: string;
  /** Somente prévia (sem efeitos). */
  preview: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Parse estrito: nada de valor, destino ou composição vem do navegador. */
export function parseRestructureCommand(raw: unknown): RestructureCommand | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const allowed = ["operationId", "kind", "sourceIds", "splitMode", "installments", "firstDueDate", "intervalMonths", "description", "reason", "preview", "confirmed"];
  if (Object.keys(v).some((k) => !allowed.includes(k))) return null;
  if (typeof v.operationId !== "string" || !UUID.test(v.operationId)) return null;
  if (v.kind !== "consolidate" && v.kind !== "split") return null;
  if (!Array.isArray(v.sourceIds) || v.sourceIds.length < 1 || v.sourceIds.length > 50 || v.sourceIds.some((id) => typeof id !== "string" || !UUID.test(id))) return null;
  if (new Set(v.sourceIds).size !== v.sourceIds.length) return null;
  if (v.kind === "split" && v.splitMode !== "by_source" && v.splitMode !== "by_service") return null;
  if (v.kind === "consolidate" && v.splitMode !== undefined) return null;
  if (typeof v.installments !== "number" || !Number.isInteger(v.installments) || v.installments < 1 || v.installments > 60) return null;
  if (typeof v.firstDueDate !== "string" || !ISO.test(v.firstDueDate)) return null;
  const interval = v.intervalMonths === undefined ? 1 : v.intervalMonths;
  if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 1 || interval > 12) return null;
  if (typeof v.description !== "string" || !v.description.trim() || v.description.trim().length > 200) return null;
  if (typeof v.reason !== "string" || v.reason.trim().length < 10 || v.reason.trim().length > 500) return null;
  const preview = v.preview === true;
  // A aplicação exige confirmação explícita; a prévia não.
  if (!preview && v.confirmed !== true) return null;
  return {
    operationId: v.operationId, kind: v.kind, sourceIds: [...v.sourceIds] as string[],
    ...(v.kind === "split" ? { splitMode: v.splitMode as SplitMode } : {}),
    terms: { installments: v.installments, firstDueDate: v.firstDueDate, intervalMonths: interval },
    description: v.description.trim(), reason: v.reason.trim(), preview,
  };
}

export type SourceRow = RestructureSource & {
  reference: string;
  dueDate: string;
  /** Rótulos de exibição (compra e serviços), nunca usados como autoridade. */
  purchaseLabel: string;
  serviceTitles: Record<string, string>;
};

export type LoadSourcesResult = { ok: true; sources: SourceRow[] } | { ok: false; error: string };

export type RestructureDeps = {
  loadSources(ids: string[]): Promise<LoadSourcesResult>;
  charges: {
    inspect(receivableId: string): Promise<"none" | "cancellable" | "paid_or_confirmed" | "ambiguous_reservation" | "cancellation_unproven" | "local_state_changed">;
    supersede(receivableId: string): Promise<{ kind: "none" | "cancelled" } | { kind: "blocked"; reason: string }>;
  };
  restructure(args: {
    operationId: string; kind: "consolidate" | "split"; sources: string[]; targets: RestructureTarget[]; reason: string;
  }): Promise<{ ok: true; restructuringId: string; targetIds: string[]; replayed: boolean } | { ok: false; error: string }>;
  reassess(ids: string[]): Promise<void>;
  audit(event: { action: string; entityId: string; metadata: Record<string, unknown> }): Promise<void>;
  today: string;
};

export type RestructurePreview = {
  kind: "consolidate" | "split";
  sources: Array<{ id: string; reference: string; dueDate: string; outstandingCents: number; purchaseLabel: string; services: string[] }>;
  targets: Array<{ dueDate: string; description: string; totalCents: number; services: Array<{ serviceId: string; title: string; cents: number }> }>;
  totalCents: number;
};

export type RestructureOutcome =
  | { ok: true; preview: RestructurePreview; applied: false }
  | { ok: true; preview: RestructurePreview; applied: true; restructuringId: string; targetIds: string[]; replayed: boolean }
  | { ok: false; code: "invalid" | "ineligible" | "charge_blocked" | "rejected" | "unavailable"; error: string };

const CHARGE_MESSAGES: Record<string, string> = {
  paid_or_confirmed: "Há pagamento já confirmado ou em confirmação nesta cobrança. Aguarde a conciliação antes de reestruturar.",
  ambiguous_reservation: "Há uma cobrança com resultado incerto no gateway. Concilie antes de reestruturar.",
  cancellation_unproven: "Não foi possível comprovar o cancelamento da cobrança externa. Nada foi reestruturado.",
  local_state_changed: "A cobrança mudou durante a operação. Tente novamente.",
};

function buildPreview(kind: "consolidate" | "split", rows: SourceRow[], targets: RestructureTarget[]): RestructurePreview {
  const titles = new Map<string, string>();
  for (const r of rows) for (const [id, title] of Object.entries(r.serviceTitles)) titles.set(id, title);
  return {
    kind,
    sources: rows.map((r) => ({
      id: r.id, reference: r.reference, dueDate: r.dueDate, outstandingCents: r.outstandingCents, purchaseLabel: r.purchaseLabel,
      services: r.allocations.map((a) => r.serviceTitles[a.serviceId] ?? "Serviço"),
    })),
    targets: targets.map((t) => ({
      dueDate: t.dueDate, description: t.description, totalCents: t.allocations.reduce((a, l) => a + l.cents, 0),
      services: t.allocations.map((l) => ({ serviceId: l.serviceId, title: titles.get(l.serviceId) ?? "Serviço", cents: l.cents })),
    })),
    totalCents: rows.reduce((a, r) => a + r.outstandingCents, 0),
  };
}

export async function runRestructuring(command: RestructureCommand, deps: RestructureDeps): Promise<RestructureOutcome> {
  let loaded: LoadSourcesResult;
  try { loaded = await deps.loadSources(command.sourceIds); } catch { return { ok: false, code: "unavailable", error: "Consulta financeira indisponível. Tente novamente." }; }
  if (!loaded.ok) return { ok: false, code: "ineligible", error: loaded.error };
  const rows = [...loaded.sources].sort((a, b) => a.id.localeCompare(b.id));
  if (rows.length !== command.sourceIds.length) return { ok: false, code: "ineligible", error: "Alguma cobrança selecionada não está disponível." };

  let targets: RestructureTarget[];
  try {
    targets = command.kind === "consolidate"
      ? planConsolidation(rows, command.terms, command.description, deps.today)
      : planSplit(rows, command.splitMode!, command.terms, command.description, deps.today,
        Object.fromEntries(rows.flatMap((r) => [[r.id, `${command.description} — ${r.purchaseLabel}`], ...Object.entries(r.serviceTitles).map(([id, t]) => [id, `${command.description} — ${t}`])])));
    validateRestructuring(rows, targets, deps.today);
  } catch (error) {
    if (error instanceof RestructureValidationError) return { ok: false, code: "invalid", error: error.message };
    return { ok: false, code: "invalid", error: "Não foi possível montar a nova composição." };
  }
  const preview = buildPreview(command.kind, rows, targets);
  if (command.preview) return { ok: true, preview, applied: false };

  // 1) Inspeção local prévia: nada é cancelado se alguma cobrança já está paga/confirmada/ambígua.
  for (const row of rows) {
    const state = await deps.charges.inspect(row.id);
    if (state !== "none" && state !== "cancellable") return { ok: false, code: "charge_blocked", error: CHARGE_MESSAGES[state] ?? CHARGE_MESSAGES.cancellation_unproven };
  }
  // 2) Cancelamento externo com prova, um título por vez (ordem estável). Sem prova → recusa.
  for (const row of rows) {
    let result: Awaited<ReturnType<RestructureDeps["charges"]["supersede"]>>;
    try { result = await deps.charges.supersede(row.id); } catch { return { ok: false, code: "charge_blocked", error: CHARGE_MESSAGES.cancellation_unproven }; }
    if (result.kind === "blocked") {
      await deps.audit({ action: "restructure_blocked", entityId: row.id, metadata: { operationId: command.operationId, reason: result.reason } }).catch(() => undefined);
      return { ok: false, code: "charge_blocked", error: CHARGE_MESSAGES[result.reason] ?? CHARGE_MESSAGES.cancellation_unproven };
    }
  }
  // 3) Banco: revalida sob lock, conserva e preserva linhagem. Falha mantém o arranjo existente.
  const applied = await deps.restructure({ operationId: command.operationId, kind: command.kind, sources: rows.map((r) => r.id), targets, reason: command.reason });
  if (!applied.ok) return { ok: false, code: "rejected", error: applied.error };
  await deps.audit({
    action: command.kind, entityId: applied.restructuringId,
    metadata: { operationId: command.operationId, sources: rows.map((r) => r.id), targets: applied.targetIds, totalCents: preview.totalCents, replayed: applied.replayed },
  }).catch(() => undefined);
  // 4) Reavaliação event-driven (somente serviços ligados a estes títulos); falha não desfaz nada, a rotina diária recupera.
  await deps.reassess([...rows.map((r) => r.id), ...applied.targetIds].slice(0, 50)).catch(() => undefined);
  return { ok: true, preview, applied: true, restructuringId: applied.restructuringId, targetIds: applied.targetIds, replayed: applied.replayed };
}
