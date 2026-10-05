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

export interface ReceivableListQuery {
  clientId?: string;
  contractId?: string;
  status?: Receivable["status"];
  sourceType?: Receivable["sourceType"];
}

export interface ReceivableRepository {
  list(query?: ReceivableListQuery): Promise<ReceivableWithBalance[]>;
  getById(id: string): Promise<ReceivableWithBalance | null>;
  create(record: NewReceivableRecord): Promise<Receivable>;
  update(id: string, changes: ReceivableChanges): Promise<Receivable>;

  listReceipts(receivableId: string): Promise<ReceivableReceipt[]>;
  addReceipt(record: NewReceiptRecord): Promise<ReceivableReceipt>;
  reverseReceipt(id: string, reversal: ReversalInput): Promise<ReceivableReceipt>;

  listAdjustments(receivableId: string): Promise<ReceivableAdjustment[]>;
  addAdjustment(record: NewAdjustmentRecord): Promise<ReceivableAdjustment>;
  reverseAdjustment(id: string, reversal: ReversalInput): Promise<ReceivableAdjustment>;
}
