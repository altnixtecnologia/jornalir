import type { ReceivableAdjustment, ReceivableReceipt, ReceivableWithBalance, Receivable } from "@ir/types";

export type NewReceivableRecord = Omit<Receivable, "id" | "reference" | "createdAt" | "updatedAt">;
export type ReceivableChanges = Partial<NewReceivableRecord>;

export type NewReceiptRecord = Omit<ReceivableReceipt, "id" | "recordedByProfileId" | "recordedAt" | "reversedAt" | "reversedByProfileId" | "reversalReason">;
export type NewAdjustmentRecord = Omit<ReceivableAdjustment, "id" | "recordedByProfileId" | "recordedAt" | "reversedAt" | "reversedByProfileId" | "reversalReason">;

export interface ReversalInput {
  reversedByProfileId: string;
  reversalReason: string;
}

export class ReceivableValidationError extends Error {}

/** Já existe uma cobrança desta assinatura para esta competência — nunca
 * duas iguais (índice único parcial em subscription_id+competency_date,
 * Parte 3B item 5). */
export class ReceivableDuplicateSubscriptionChargeError extends Error {
  constructor(competencyDate: string) {
    super(`Já existe uma cobrança desta assinatura para a competência ${competencyDate}.`);
  }
}

export interface ReceivableListQuery {
  clientId?: string;
  contractId?: string;
  subscriptionId?: string;
  status?: Receivable["status"];
  sourceType?: Receivable["sourceType"];
}

/** Títulos ainda em aberto/parcial da MESMA origem (Parte 3B.1, item 7 —
 * "saldo anterior em aberto") — nunca inclui o próprio título atual
 * (excludeId). subscriptionId/contractId só fazem sentido junto do
 * sourceType correspondente, mesma semântica de Receivable. */
export interface OpenByOriginQuery {
  clientId: string;
  sourceType: Receivable["sourceType"];
  subscriptionId?: string;
  contractId?: string;
  excludeId?: string;
}

export interface ReceivableRepository {
  list(query?: ReceivableListQuery): Promise<ReceivableWithBalance[]>;
  getById(id: string): Promise<ReceivableWithBalance | null>;
  create(record: NewReceivableRecord): Promise<Receivable>;
  update(id: string, changes: ReceivableChanges): Promise<Receivable>;
  /** Pré-checagem de idempotência (UX melhor que só esperar o erro do banco) — o índice único parcial em subscription_id+competency_date continua sendo a proteção autoritativa. */
  findBySubscriptionAndCompetency(subscriptionId: string, competencyDate: string): Promise<Receivable | null>;
  /** Mesmo cliente+origem, status aberto/parcial, nunca o próprio título (Parte 3B.1, item 7). Ordenado do mais antigo pro mais novo. */
  listOpenForOrigin(query: OpenByOriginQuery): Promise<ReceivableWithBalance[]>;

  listReceipts(receivableId: string): Promise<ReceivableReceipt[]>;
  addReceipt(record: NewReceiptRecord): Promise<ReceivableReceipt>;
  reverseReceipt(id: string, reversal: ReversalInput): Promise<ReceivableReceipt>;

  listAdjustments(receivableId: string): Promise<ReceivableAdjustment[]>;
  addAdjustment(record: NewAdjustmentRecord): Promise<ReceivableAdjustment>;
  reverseAdjustment(id: string, reversal: ReversalInput): Promise<ReceivableAdjustment>;
}
