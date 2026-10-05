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
export type AdjustmentType = "discount" | "settlement_difference";

export const RECEIVABLE_SOURCE_TYPES: readonly ReceivableSourceType[] = [
  "subscription",
  "advertising",
  "institutional_contract",
  "miscellaneous",
  "other",
];
export const RECEIVABLE_STATUSES: readonly ReceivableStatus[] = ["open", "partially_paid", "paid", "cancelled"];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "pix", "bank_transfer", "check", "card", "other"];
export const ADJUSTMENT_TYPES: readonly AdjustmentType[] = ["discount", "settlement_difference"];

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
 * originalAmount. reason é obrigatório. */
export interface ReceivableAdjustment {
  id: string;
  receivableId: string;
  amount: number;
  adjustmentType: AdjustmentType;
  reason: string;
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
