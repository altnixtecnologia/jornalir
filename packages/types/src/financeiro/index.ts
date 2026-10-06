// Módulo Financeiro (Parte 3A/3B) — fundação + Contas a Receber +
// Contratos Institucionais + geração manual de títulos. Contas a pagar,
// fornecedores, contas bancárias e fluxo de caixa são deliberadamente
// deixados de fora desta fase — o modelo não os impede, mas nenhum tipo
// deles existe aqui ainda.

import type { SubscriptionPeriodicity } from "../assinaturas";

/**
 * Avança uma data de competência por N "passos" de periodicidade —
 * mesma regra de meses usada em computeNextDueDate (módulo Assinaturas),
 * reaproveitada aqui em vez de duplicada (Parte 3B, item 3: "usar as
 * regras já existentes no módulo Assinaturas"). Usada pela geração de
 * período (N próximas cobranças) e pelas parcelas de contrato.
 */
export function addPeriodicityInterval(dateIso: string, periodicity: SubscriptionPeriodicity, steps: number): string {
  const monthsPerStep = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[periodicity];
  const date = new Date(`${dateIso}T00:00:00`);
  const day = date.getDate();
  const targetMonth = date.getMonth() + monthsPerStep * steps;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(targetYear, normalizedMonth, clampedDay).toISOString().slice(0, 10);
}

// --- Títulos / Contas a receber ---------------------------------------

export type ReceivableSourceType = "subscription" | "advertising" | "institutional_contract" | "miscellaneous" | "other";
export type ReceivableStatus = "open" | "partially_paid" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "pix" | "bank_transfer" | "check" | "card" | "other";
export type AdjustmentType = "discount" | "settlement_difference" | "credit_applied";

export const RECEIVABLE_SOURCE_TYPES: readonly ReceivableSourceType[] = [
  "subscription",
  "advertising",
  "institutional_contract",
  "miscellaneous",
  "other",
];
export const RECEIVABLE_STATUSES: readonly ReceivableStatus[] = ["open", "partially_paid", "paid", "cancelled"];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "pix", "bank_transfer", "check", "card", "other"];
export const ADJUSTMENT_TYPES: readonly AdjustmentType[] = ["discount", "settlement_difference", "credit_applied"];

export const RECEIVABLE_SOURCE_TYPE_LABELS: Record<ReceivableSourceType, string> = {
  subscription: "Assinatura",
  advertising: "Publicidade",
  institutional_contract: "Contrato institucional",
  miscellaneous: "Avulso",
  other: "Outro",
};

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  open: "Aberto",
  partially_paid: "Parcialmente pago",
  paid: "Quitado",
  cancelled: "Cancelado",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  bank_transfer: "Transferência bancária",
  check: "Cheque",
  card: "Cartão",
  other: "Outro",
};

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  discount: "Desconto",
  settlement_difference: "Abatimento de quitação",
  credit_applied: "Crédito aplicado",
};

/** Transições de status permitidas — cancelado é estado final, nunca
 * volta a aberto/parcial/quitado (mesmo princípio de
 * SUBSCRIPTION_STATUS_TRANSITIONS). Quitado/aberto/parcial são sempre
 * RECALCULADOS a partir do saldo (ver recomputeReceivableStatus), nunca
 * escolhidos livremente pelo usuário — só "Cancelar" é uma ação direta. */
export const RECEIVABLE_STATUS_TRANSITIONS: Record<ReceivableStatus, readonly ReceivableStatus[]> = {
  open: ["partially_paid", "paid", "cancelled"],
  partially_paid: ["open", "paid", "cancelled"],
  paid: ["open", "partially_paid", "cancelled"],
  cancelled: [],
};

export function canTransitionReceivableStatus(from: ReceivableStatus, to: ReceivableStatus): boolean {
  return RECEIVABLE_STATUS_TRANSITIONS[from].includes(to);
}

/** "Vencido"/"vence hoje"/"vencendo em breve" NUNCA são gravados — são
 * sempre calculados comparando due_date com a data atual, e só fazem
 * sentido pra títulos ainda em aberto (open/partially_paid). */
export type ReceivableDueFlag = "overdue" | "due_today" | "due_soon" | null;

const DUE_SOON_DAYS = 7;

export function computeReceivableDueFlag(dueDate: string, status: ReceivableStatus, today: Date = new Date()): ReceivableDueFlag {
  if (status !== "open" && status !== "partially_paid") return null;
  const reference = new Date(today);
  reference.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays <= DUE_SOON_DAYS) return "due_soon";
  return null;
}

/** Recalcula o status a partir do saldo — nunca o contrário. Chamado
 * depois de qualquer recebimento/abatimento/estorno válido mudar o
 * saldo. Nunca promove para 'cancelled' (só a ação explícita de
 * cancelar faz isso) nem altera um título já cancelado. */
export function recomputeReceivableStatus(current: ReceivableStatus, originalAmount: number, balance: number): ReceivableStatus {
  if (current === "cancelled") return "cancelled";
  if (balance <= 0) return "paid";
  if (balance < originalAmount) return "partially_paid";
  return "open";
}

export interface Receivable {
  id: string;
  reference: string;
  clientId: string;
  description: string;
  sourceType: ReceivableSourceType;
  /** Referência genérica e opcional ao registro de origem (ex.: subscriptionId quando sourceType === "subscription"). Sem acoplamento forte — nunca uma FK de domínio aqui. */
  sourceId?: string;
  /** Texto legível da origem (ex.: "Assinatura IR-ASS-2026-000012"). */
  sourceReference?: string;
  /** Preenchido SÓ quando sourceType === "subscription" — referência real (com FK) à assinatura, usada pela proteção de duplicidade (um índice único por competência). Nunca usado por outras origens. */
  subscriptionId?: string;
  contractId?: string;
  originalAmount: number;
  issueDate: string;
  dueDate: string;
  competencyDate?: string;
  status: ReceivableStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Receivable + saldo já calculado (só recebimentos/abatimentos não
 * estornados) — evita recomputar em todo lugar que precisa exibir. */
export interface ReceivableWithBalance extends Receivable {
  totalReceived: number;
  totalAdjustments: number;
  balance: number;
}

/** Recebimento individual — nunca sobrescreve outro. receivedBy (quem
 * efetivamente recebeu) e recordedBy (quem registrou no sistema) são
 * conceitos DIFERENTES, sempre gravados separadamente. */
export interface ReceivableReceipt {
  id: string;
  receivableId: string;
  amount: number;
  receivedAt: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
  receivedByProfileId?: string;
  recordedByProfileId?: string;
  recordedAt: string;
  reversedAt?: string;
  reversedByProfileId?: string;
  reversalReason?: string;
}

/** Abatimento/desconto — registro próprio e auditável, nunca altera
 * originalAmount. reason é obrigatório para discount/settlement_difference
 * (credit_applied não exige motivo em texto — a origem já está em creditId). */
export interface ReceivableAdjustment {
  id: string;
  receivableId: string;
  amount: number;
  adjustmentType: AdjustmentType;
  reason: string;
  /** Preenchido SÓ quando adjustmentType === "credit_applied" — qual ClientCredit foi usado (Parte 3B.1). Nunca usado por discount/settlement_difference. */
  creditId?: string;
  authorizedByProfileId?: string;
  recordedByProfileId?: string;
  recordedAt: string;
  notes?: string;
  reversedAt?: string;
  reversedByProfileId?: string;
  reversalReason?: string;
}

export function isReversed(entry: Pick<ReceivableReceipt | ReceivableAdjustment, "reversedAt">): boolean {
  return Boolean(entry.reversedAt);
}

// --- Contratos institucionais -------------------------------------------

export type ContractStatus = "active" | "expired" | "terminated";
export type ContractDocumentType = "contract" | "amendment" | "commitment_order" | "invoice" | "authorization" | "other";

export const CONTRACT_STATUSES: readonly ContractStatus[] = ["active", "expired", "terminated"];
export const CONTRACT_DOCUMENT_TYPES: readonly ContractDocumentType[] = [
  "contract",
  "amendment",
  "commitment_order",
  "invoice",
  "authorization",
  "other",
];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: "Ativo",
  expired: "Vencido",
  terminated: "Rescindido",
};

export const CONTRACT_DOCUMENT_TYPE_LABELS: Record<ContractDocumentType, string> = {
  contract: "Contrato original",
  amendment: "Aditivo",
  commitment_order: "Empenho",
  invoice: "Nota/documento",
  authorization: "Autorização",
  other: "Outro",
};

export interface InstitutionalContract {
  id: string;
  reference: string;
  clientId: string;
  contractNumber?: string;
  processNumber?: string;
  modality?: string;
  biddingReference?: string;
  object?: string;
  contractedAmount?: number;
  startsAt?: string;
  endsAt?: string;
  status: ContractStatus;
  notes?: string;
  /** Dados complementares opcionais que variam por órgão — nunca duplica campo que já tem coluna própria. */
  extraData?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Resumo financeiro do contrato (preparação futura, Parte 3A item 14) —
 * não totalmente automatizado nesta fase; o modelo só não pode impedir. */
export interface InstitutionalContractFinancialSummary {
  contractedAmount?: number;
  billedAmount: number;
  receivedAmount: number;
  adjustmentsAmount: number;
  balance?: number;
}

/**
 * Resultado BRUTO de uma extração automática de documento — sempre
 * auxílio, nunca aplicado automaticamente. O usuário sempre confere
 * antes de qualquer campo real do contrato mudar.
 */
export interface ContractDocumentExtractedData {
  organizationName?: string;
  organizationCnpj?: string;
  contractNumber?: string;
  processNumber?: string;
  modality?: string;
  biddingReference?: string;
  object?: string;
  commitmentOrder?: string;
  startsAt?: string;
  endsAt?: string;
  contractedAmount?: number;
  competencyDate?: string;
}

export interface ContractDocument {
  id: string;
  contractId: string;
  documentType: ContractDocumentType;
  name: string;
  /** Só a referência — upload real (R2) é módulo futuro, não implementado nesta fase. */
  fileReference?: string;
  documentDate?: string;
  notes?: string;
  extractedData?: ContractDocumentExtractedData;
  uploadedByProfileId?: string;
  createdAt: string;
}

/**
 * Aditivo contratual (Parte 3B, item 9) — NUNCA altera
 * `InstitutionalContract.contractedAmount`/`endsAt` diretamente; o valor
 * e a vigência vigentes são sempre calculados somando os aditivos a
 * partir do original (ver computeEffectiveContractAmount/
 * computeEffectiveContractEndsAt), preservando o histórico completo.
 * Sem gestão jurídica complexa de propósito — só valor adicional e/ou
 * nova data final.
 */
export interface ContractAmendment {
  id: string;
  contractId: string;
  amount: number;
  newEndsAt?: string;
  documentId?: string;
  reason?: string;
  notes?: string;
  createdByProfileId?: string;
  createdAt: string;
}

/** Valor vigente = original + soma dos aditivos — nunca sobrescreve o original. */
export function computeEffectiveContractAmount(contractedAmount: number | undefined, amendments: Pick<ContractAmendment, "amount">[]): number | undefined {
  if (contractedAmount === undefined) return undefined;
  return contractedAmount + amendments.reduce((sum, amendment) => sum + amendment.amount, 0);
}

/** Vigência vigente = a mais recente entre o fim original e os fins informados pelos aditivos (um aditivo sem newEndsAt não muda a vigência). */
export function computeEffectiveContractEndsAt(endsAt: string | undefined, amendments: Pick<ContractAmendment, "newEndsAt">[]): string | undefined {
  const candidates = [endsAt, ...amendments.map((amendment) => amendment.newEndsAt)].filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return undefined;
  return candidates.reduce((latest, candidate) => (candidate > latest ? candidate : latest));
}

// --- Crédito do cliente (Parte 3B.1) -------------------------------------
//
// Deliberadamente NÃO um saldo mutável (nunca `clients.credit_balance`
// sobrescrito). Cada crédito é uma linha própria e imutável (origem,
// valor original); o saldo disponível é sempre CALCULADO a partir das
// aplicações válidas (ver ClientCreditWithBalance.balance, espelhando
// receivables_with_balance/recomputeReceivableStatus). Aplicar um
// crédito num título reaproveita ReceivableAdjustment
// (adjustmentType="credit_applied" + creditId) — nunca uma tabela de
// "aplicações" paralela, pelo mesmo motivo que descontos já vivem em
// receivable_adjustments: reduz o saldo do título sem ser um
// recebimento de dinheiro novo.

export interface ClientCredit {
  id: string;
  clientId: string;
  sourceType: ReceivableSourceType;
  /** Preenchido SÓ quando sourceType === "subscription" — mesma semântica de Receivable.subscriptionId, usada pra casar "mesma origem" na aplicação automática. */
  subscriptionId?: string;
  /** Preenchido SÓ quando sourceType === "institutional_contract". */
  contractId?: string;
  /** De qual título/recebimento este crédito surgiu — rastreabilidade (item 2), nunca obrigatório (um crédito pode futuramente vir de outro fluxo). */
  originReceivableId?: string;
  originReceiptId?: string;
  originalAmount: number;
  reason?: string;
  notes?: string;
  createdByProfileId?: string;
  createdAt: string;
  reversedAt?: string;
  reversedByProfileId?: string;
  reversalReason?: string;
}

/** ClientCredit + saldo já calculado (original_amount - aplicações válidas). */
export interface ClientCreditWithBalance extends ClientCredit {
  totalApplied: number;
  balance: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * "Mesma origem" (item 3/4) — só assinatura/contrato têm um id de
 * recorrência bem definido pra casar automaticamente; avulso/
 * publicidade/outro NUNCA aplicam crédito automaticamente (ficam
 * disponíveis só pra aplicação manual futura). Nunca cruza origens
 * diferentes (ex.: crédito de Publicidade não serve pra Assinatura),
 * mesmo quando sourceType bate mas o id específico não.
 */
export function creditMatchesReceivableOrigin(
  credit: Pick<ClientCredit, "sourceType" | "subscriptionId" | "contractId">,
  receivable: Pick<Receivable, "sourceType" | "subscriptionId" | "contractId">,
): boolean {
  if (credit.sourceType !== receivable.sourceType) return false;
  if (receivable.sourceType === "subscription") {
    return Boolean(receivable.subscriptionId) && credit.subscriptionId === receivable.subscriptionId;
  }
  if (receivable.sourceType === "institutional_contract") {
    return Boolean(receivable.contractId) && credit.contractId === receivable.contractId;
  }
  return false;
}

export interface CreditApplicationPlanItem {
  creditId: string;
  amount: number;
}

/**
 * Plano puro de aplicação automática de crédito num título (item 16) —
 * recebe os créditos disponíveis da MESMA origem (já filtrados por
 * creditMatchesReceivableOrigin, ordenados do mais antigo pro mais
 * novo) e o saldo do título; devolve quanto usar de cada crédito e o
 * saldo restante do título. Nunca aplica o mesmo crédito duas vezes —
 * cada `balance` já reflete aplicações anteriores (sempre derivado,
 * nunca um contador que possa dessincronizar).
 */
export function planCreditApplication(
  availableCredits: Pick<ClientCreditWithBalance, "id" | "balance">[],
  receivableBalance: number,
): { applications: CreditApplicationPlanItem[]; remainingReceivableBalance: number } {
  let remaining = receivableBalance;
  const applications: CreditApplicationPlanItem[] = [];
  for (const credit of availableCredits) {
    if (remaining <= 0) break;
    if (credit.balance <= 0) continue;
    const amount = round2(Math.min(remaining, credit.balance));
    if (amount <= 0) continue;
    applications.push({ creditId: credit.id, amount });
    remaining = round2(remaining - amount);
  }
  return { applications, remainingReceivableBalance: remaining };
}

export interface OverpaymentSplit {
  appliedToReceivable: number;
  creditAmount: number;
}

/**
 * Divide um recebimento que pode ultrapassar o saldo do título (item 2)
 * — nunca perde o valor total efetivamente recebido: o que não cobre o
 * saldo atual vira crédito (criedAmount), o título nunca recebe mais do
 * que o necessário pra zerar o saldo.
 */
export function splitOverpayment(amountReceived: number, receivableBalance: number): OverpaymentSplit {
  const appliedToReceivable = round2(Math.min(amountReceived, receivableBalance));
  const creditAmount = round2(amountReceived - appliedToReceivable);
  return { appliedToReceivable, creditAmount };
}

export interface AllocationTarget {
  id: string;
  balance: number;
}

export interface AllocationPlanItem {
  id: string;
  amount: number;
}

/**
 * Aplica um único pagamento em vários títulos da MESMA origem, do mais
 * antigo pro mais novo (item 8) — `targets` já deve vir ordenado do
 * mais antigo pro mais novo (ex.: por competencyDate/dueDate) por quem
 * chama. O que sobrar depois de quitar todos os saldos é excedente —
 * quem chama decide o que fazer com ele (normalmente: splitOverpayment/
 * virar ClientCredit).
 */
export function allocatePaymentAcrossReceivables(
  targets: AllocationTarget[],
  amountPaid: number,
): { allocations: AllocationPlanItem[]; remainingPayment: number } {
  let remaining = amountPaid;
  const allocations: AllocationPlanItem[] = [];
  for (const target of targets) {
    if (remaining <= 0) break;
    if (target.balance <= 0) continue;
    const amount = round2(Math.min(remaining, target.balance));
    if (amount <= 0) continue;
    allocations.push({ id: target.id, amount });
    remaining = round2(remaining - amount);
  }
  return { allocations, remainingPayment: remaining };
}

/**
 * Quanto efetivamente solicitar via Pix/cartão/cobrança ao cliente
 * (item 9) quando há crédito disponível da MESMA origem — o título em
 * si continua com o valor original; só o valor PEDIDO ao cliente já
 * desconta o crédito. Mesma conta de planCreditApplication, mas
 * resumida pra um total (quando a composição não precisa detalhar de
 * qual crédito individual veio).
 */
export function computeAmountToCollect(receivableBalance: number, availableCredit: number): { amountToCollect: number; creditApplied: number } {
  const creditApplied = round2(Math.min(receivableBalance, Math.max(0, availableCredit)));
  const amountToCollect = round2(receivableBalance - creditApplied);
  return { amountToCollect, creditApplied };
}

export interface ReceivableCompositionLine {
  label: string;
  /** Positivo = soma ao total; negativo = desconto/crédito. */
  amount: number;
}

export interface ReceivableComposition {
  lines: ReceivableCompositionLine[];
  total: number;
}

/**
 * Monta a "Composição do valor" exibível (fatura/carnê/Pix/mensagem de
 * cobrança — item 10/11) de UM título atual, somando saldo(s)
 * anterior(es) em aberto da MESMA origem e crédito disponível da MESMA
 * origem. Pura VISÃO agregada (item 15) — nunca funde títulos no banco,
 * nunca muda valor original, nunca apaga competência; quem chama já
 * calculou `priorOpenBalance`/`availableCredit` a partir dos títulos/
 * créditos reais.
 */
export function buildReceivableComposition(input: {
  currentChargeLabel: string;
  currentChargeAmount: number;
  priorOpenBalance?: number;
  priorOpenLabel?: string;
  availableCredit?: number;
  creditLabel?: string;
  adjustmentsAmount?: number;
}): ReceivableComposition {
  const lines: ReceivableCompositionLine[] = [{ label: input.currentChargeLabel, amount: round2(input.currentChargeAmount) }];
  if (input.priorOpenBalance && input.priorOpenBalance > 0) {
    lines.push({ label: input.priorOpenLabel ?? "Saldo anterior em aberto", amount: round2(input.priorOpenBalance) });
  }
  if (input.availableCredit && input.availableCredit > 0) {
    lines.push({ label: input.creditLabel ?? "Crédito de saldo anterior", amount: -round2(input.availableCredit) });
  }
  if (input.adjustmentsAmount && input.adjustmentsAmount > 0) {
    lines.push({ label: "Desconto/abatimento", amount: -round2(input.adjustmentsAmount) });
  }
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { lines, total };
}
