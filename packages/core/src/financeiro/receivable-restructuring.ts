/**
 * Reestruturação administrativa de cobranças (unificar / dividir) e avaliação por serviço — lógica PURA.
 *
 * Todo valor é inteiro em centavos (nunca ponto flutuante). A autoridade é o banco
 * (`restructure_receivables`, `altnix_assess_service_finance`); este módulo calcula a PRÉVIA mostrada ao
 * operador e valida a conservação antes de chamar o banco, com as mesmas regras:
 *  - soma por serviço das origens == soma por serviço dos destinos;
 *  - nada negativo, nenhuma alocação zero, nenhum serviço órfão ou repetido num destino;
 *  - serviço de valor zero nunca recebe dívida;
 *  - arredondamento determinístico: maior resto, desempate pela ordem do serviço.
 * Pagamento parcial NUNCA é rateado entre serviços: títulos com histórico não são reestruturados aqui.
 */

export type AllocationLine = { serviceId: string; cents: number };

export type RestructureSource = {
  id: string;
  clientId: string;
  /** Valor em aberto == valor original (somente títulos sem histórico entram na reestruturação). */
  outstandingCents: number;
  allocations: AllocationLine[];
};

export type RestructureTarget = {
  dueDate: string; // YYYY-MM-DD
  description: string;
  allocations: AllocationLine[];
};

export type PaymentTerms = { installments: number; firstDueDate: string; intervalMonths?: number };

export class RestructureValidationError extends Error {
  constructor(message: string) { super(message); this.name = "RestructureValidationError"; }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isSafeCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Distribui `total` (centavos) pelos pesos, pelo maior resto; desempate pela posição. Soma exata. */
export function allocateProportionally(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RestructureValidationError("Total inválido.");
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new RestructureValidationError("Peso inválido.");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || sum === 0) {
    if (total === 0) return weights.map(() => 0);
    throw new RestructureValidationError("Sem base para distribuir o valor.");
  }
  // BigInt evita estouro de precisão em total * peso.
  const T = BigInt(total), S = BigInt(sum);
  const base = weights.map((w) => (T * BigInt(w)) / S);
  const frac = weights.map((w) => (T * BigInt(w)) % S);
  let remaining = Number(T - base.reduce((a, b) => a + b, 0n));
  const order = weights.map((_, i) => i).sort((a, b) => (frac[a] === frac[b] ? a - b : frac[a] > frac[b] ? -1 : 1));
  const out = base.map((b) => Number(b));
  for (const i of order) {
    if (remaining <= 0) break;
    if (weights[i] === 0) continue;
    out[i] += 1;
    remaining -= 1;
  }
  return out;
}

/** Soma dias/meses em UTC, com limite no último dia do mês (31/01 + 1 mês = 28/02). */
export function addMonthsIso(dateIso: string, months: number): string {
  if (!ISO_DATE.test(dateIso) || !Number.isInteger(months)) throw new RestructureValidationError("Data inválida.");
  const [y, m, d] = dateIso.split("-").map(Number);
  const target = m - 1 + months;
  const year = y + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(year, month, Math.min(d, last)));
  return out.toISOString().slice(0, 10);
}

function assertTerms(terms: PaymentTerms, today: string) {
  if (!Number.isInteger(terms.installments) || terms.installments < 1 || terms.installments > 60) throw new RestructureValidationError("Número de parcelas inválido (1 a 60).");
  if (!ISO_DATE.test(terms.firstDueDate)) throw new RestructureValidationError("Primeiro vencimento inválido.");
  if (terms.firstDueDate < today) throw new RestructureValidationError("O primeiro vencimento não pode estar no passado.");
  const interval = terms.intervalMonths ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) throw new RestructureValidationError("Intervalo entre parcelas inválido.");
}

export function totalCents(lines: AllocationLine[]): number {
  return lines.reduce((acc, line) => acc + line.cents, 0);
}

/** Soma as alocações por serviço (ordem de primeira aparição, estável). */
export function sumByService(lines: AllocationLine[]): AllocationLine[] {
  const map = new Map<string, number>();
  for (const line of lines) map.set(line.serviceId, (map.get(line.serviceId) ?? 0) + line.cents);
  return [...map.entries()].map(([serviceId, cents]) => ({ serviceId, cents }));
}

/** Divide a composição por serviço em N parcelas (cada serviço conserva o total; centavos extras nas primeiras). */
export function scheduleInstallments(composition: AllocationLine[], terms: PaymentTerms, description: string, today: string): RestructureTarget[] {
  assertTerms(terms, today);
  const per = composition.map((line) => allocateProportionally(line.cents, Array.from({ length: terms.installments }, () => 1)));
  const interval = terms.intervalMonths ?? 1;
  const targets: RestructureTarget[] = [];
  for (let i = 0; i < terms.installments; i += 1) {
    const allocations = composition
      .map((line, idx) => ({ serviceId: line.serviceId, cents: per[idx][i] }))
      .filter((line) => line.cents > 0);
    if (allocations.length === 0) continue;
    targets.push({
      dueDate: addMonthsIso(terms.firstDueDate, i * interval),
      description: terms.installments > 1 ? `${description} — parcela ${i + 1}/${terms.installments}` : description,
      allocations,
    });
  }
  return targets;
}

function assertSources(sources: RestructureSource[]) {
  if (sources.length === 0) throw new RestructureValidationError("Selecione ao menos uma cobrança.");
  if (new Set(sources.map((s) => s.id)).size !== sources.length) throw new RestructureValidationError("Cobrança repetida na seleção.");
  if (new Set(sources.map((s) => s.clientId)).size !== 1) throw new RestructureValidationError("Cobranças de clientes diferentes não podem ser reestruturadas juntas.");
  for (const s of sources) {
    if (!isSafeCents(s.outstandingCents)) throw new RestructureValidationError("Cobrança sem saldo em aberto.");
    if (s.allocations.length === 0 || s.allocations.some((a) => !isSafeCents(a.cents))) throw new RestructureValidationError("Composição por serviço não comprovada.");
    if (totalCents(s.allocations) !== s.outstandingCents) throw new RestructureValidationError("A composição por serviço não confere com o saldo.");
  }
}

/** Unificar: uma obrigação (ou parcelamento) com a composição somada de todas as origens. */
export function planConsolidation(sources: RestructureSource[], terms: PaymentTerms, description: string, today: string): RestructureTarget[] {
  assertSources(sources);
  if (sources.length < 2) throw new RestructureValidationError("Unificar exige ao menos duas cobranças.");
  return scheduleInstallments(sumByService(sources.flatMap((s) => s.allocations)), terms, description, today);
}

export type SplitMode = "by_source" | "by_service";

/** Dividir: um grupo por compra de origem ou por serviço; cada grupo pode ter seu parcelamento. */
export function planSplit(sources: RestructureSource[], mode: SplitMode, terms: PaymentTerms, description: string, today: string, labels: Record<string, string> = {}): RestructureTarget[] {
  assertSources(sources);
  const groups: Array<{ label: string; composition: AllocationLine[] }> = mode === "by_source"
    ? sources.map((s) => ({ label: labels[s.id] ?? description, composition: sumByService(s.allocations) }))
    : sumByService(sources.flatMap((s) => s.allocations)).map((line) => ({ label: labels[line.serviceId] ?? description, composition: [line] }));
  if (groups.length < 2) throw new RestructureValidationError("A divisão precisa gerar ao menos duas cobranças.");
  return groups.flatMap((g) => scheduleInstallments(g.composition, terms, g.label, today));
}

/** Conservação exata por serviço e total; usado na prévia e antes de qualquer chamada ao banco. */
export function validateRestructuring(sources: RestructureSource[], targets: RestructureTarget[], today: string): void {
  assertSources(sources);
  if (targets.length === 0 || targets.length > 60) throw new RestructureValidationError("Quantidade de cobranças resultantes inválida.");
  for (const t of targets) {
    if (!ISO_DATE.test(t.dueDate) || t.dueDate < today) throw new RestructureValidationError("Vencimento inválido ou no passado.");
    if (!t.description.trim() || t.description.length > 300) throw new RestructureValidationError("Descrição inválida.");
    if (t.allocations.length === 0 || t.allocations.some((a) => !isSafeCents(a.cents))) throw new RestructureValidationError("Composição de uma cobrança resultante inválida.");
    if (new Set(t.allocations.map((a) => a.serviceId)).size !== t.allocations.length) throw new RestructureValidationError("Serviço repetido na mesma cobrança.");
  }
  const src = new Map(sumByService(sources.flatMap((s) => s.allocations)).map((l) => [l.serviceId, l.cents]));
  const tgt = new Map(sumByService(targets.flatMap((t) => t.allocations)).map((l) => [l.serviceId, l.cents]));
  if (src.size !== tgt.size || [...src].some(([id, cents]) => tgt.get(id) !== cents)) throw new RestructureValidationError("A operação não conserva o valor de cada serviço.");
  const total = sources.reduce((a, s) => a + s.outstandingCents, 0);
  if (targets.reduce((a, t) => a + totalCents(t.allocations), 0) !== total) throw new RestructureValidationError("O total resultante não confere com o total em aberto.");
}

// ---------------------------------------------------------------------------------------------
// Avaliação por serviço (espelho puro das regras do banco, para prévia e testes de política).
// ---------------------------------------------------------------------------------------------

export type ServiceObligation = {
  receivableId: string;
  allocatedCents: number;
  dueDate: string;
  balanceCents: number; // saldo do TÍTULO inteiro (pagamento parcial não é rateado)
  status: "open" | "partially_paid" | "paid" | "cancelled";
  excludedFromReports: boolean;
};

export type ServiceFinancialState = "authorized" | "grace" | "suspended" | "review";

/** Tolerância efetiva: substituição individual ?? padrão global; sem nenhuma, a regra está desativada (null). */
export function effectiveGraceDays(override: number | null | undefined, inheritDefault: boolean, globalDefault: number | null | undefined): number | null {
  if (override !== null && override !== undefined) return override;
  if (inheritDefault && globalDefault !== null && globalDefault !== undefined) return globalDefault;
  return null;
}

export function assessServiceObligations(input: {
  serviceCents: number; obligations: ServiceObligation[]; today: string; graceDays: number;
}): { state: ServiceFinancialState; reason: string; oldestDue?: string } {
  const { serviceCents, today, graceDays } = input;
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) return { state: "review", reason: "tolerance_invalid" };
  if (serviceCents === 0) return { state: "authorized", reason: "no_overdue_balance" };
  const live = input.obligations.filter((o) => o.status !== "cancelled");
  if (live.length === 0) return { state: "review", reason: "allocation_not_proven" };
  if (live.reduce((a, o) => a + o.allocatedCents, 0) !== serviceCents) return { state: "review", reason: "billing_incomplete" };
  const overdue = live.filter((o) => !o.excludedFromReports && o.balanceCents > 0 && o.dueDate < today).map((o) => o.dueDate).sort();
  if (overdue.length === 0) return { state: "authorized", reason: "no_overdue_balance" };
  const oldest = overdue[0];
  return today <= addDaysIso(oldest, graceDays)
    ? { state: "grace", reason: "overdue_within_grace", oldestDue: oldest }
    : { state: "suspended", reason: "overdue_after_grace", oldestDue: oldest };
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
