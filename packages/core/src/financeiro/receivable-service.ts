import {
  recomputeReceivableStatus,
  type PaymentMethod,
  type Receivable,
  type ReceivableAdjustment,
  type ReceivableReceipt,
  type ReceivableSourceType,
  type ReceivableWithBalance,
  type AdjustmentType,
} from "@ir/types";
import {
  ReceivableValidationError,
  type NewReceivableRecord,
  type ReceivableChanges,
  type ReceivableListQuery,
  type ReceivableRepository,
} from "./receivable-repository";

export class ReceivableNotFoundError extends Error {
  constructor(id: string) {
    super(`Título não encontrado: ${id}`);
  }
}

/** Mesmo espírito de SubscriptionStatusTransitionError — nunca sai
 * silenciosamente de um estado pra outro não permitido. */
export class ReceivableStatusTransitionError extends Error {}

export interface ReceivableInput {
  clientId: string;
  description: string;
  sourceType: ReceivableSourceType;
  sourceId?: string;
  sourceReference?: string;
  contractId?: string;
  originalAmount: number;
  issueDate: string;
  dueDate: string;
  competencyDate?: string;
  notes?: string;
}

export interface ReceiptInput {
  amount: number;
  receivedAt: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
  receivedByProfileId?: string;
}

export interface AdjustmentInput {
  amount: number;
  adjustmentType: AdjustmentType;
  reason: string;
  authorizedByProfileId?: string;
  notes?: string;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: ReceivableInput): NewReceivableRecord {
  return {
    clientId: input.clientId,
    description: input.description.trim(),
    sourceType: input.sourceType,
    sourceId: trimOrUndefined(input.sourceId),
    sourceReference: trimOrUndefined(input.sourceReference),
    contractId: trimOrUndefined(input.contractId),
    originalAmount: input.originalAmount,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    competencyDate: input.competencyDate || undefined,
    status: "open",
    notes: trimOrUndefined(input.notes),
  };
}

function assertValidReceivable(record: Pick<NewReceivableRecord, "clientId" | "description" | "originalAmount" | "issueDate" | "dueDate">): void {
  if (!record.clientId) throw new ReceivableValidationError("Selecione o cliente/pagador deste título.");
  if (!record.description) throw new ReceivableValidationError("Informe uma descrição.");
  if (!Number.isFinite(record.originalAmount) || record.originalAmount < 0) throw new ReceivableValidationError("Informe um valor original válido.");
  if (!record.issueDate) throw new ReceivableValidationError("Informe a data de emissão.");
  if (!record.dueDate) throw new ReceivableValidationError("Informe o vencimento.");
  if (record.dueDate < record.issueDate) throw new ReceivableValidationError("O vencimento não pode ser anterior à emissão.");
}

/**
 * Fundação de Contas a Receber (Parte 3A): títulos, recebimentos
 * parciais (nunca sobrescrevem um ao outro), abatimentos/descontos
 * (registro próprio, auditável, nunca altera o valor original) e
 * estornos (registro original nunca apagado, só marcado). status é
 * sempre RECALCULADO a partir do saldo (ver recomputeReceivableStatus)
 * depois de qualquer recebimento/abatimento/estorno válido — nunca
 * escolhido livremente, exceto a ação explícita de cancelar.
 */
export class ReceivableService {
  constructor(private readonly receivables: ReceivableRepository) {}

  list(query?: ReceivableListQuery): Promise<ReceivableWithBalance[]> {
    return this.receivables.list(query);
  }

  async getById(id: string): Promise<ReceivableWithBalance> {
    const receivable = await this.receivables.getById(id);
    if (!receivable) throw new ReceivableNotFoundError(id);
    return receivable;
  }

  register(input: ReceivableInput): Promise<Receivable> {
    const record = normalize(input);
    assertValidReceivable(record);
    return this.receivables.create(record);
  }

  async update(id: string, input: ReceivableInput): Promise<Receivable> {
    const current = await this.getById(id);
    const changes: ReceivableChanges = normalize(input);
    assertValidReceivable(changes as Pick<NewReceivableRecord, "clientId" | "description" | "originalAmount" | "issueDate" | "dueDate">);
    // Edição geral nunca reabre um título cancelado nem muda status —
    // só as ações dedicadas (recebimento/abatimento/estorno/cancelar)
    // tocam esse campo.
    void current;
    const { status: _status, ...changesWithoutStatus } = changes;
    return this.receivables.update(id, changesWithoutStatus);
  }

  async cancel(id: string): Promise<Receivable> {
    const current = await this.getById(id);
    if (current.status === "cancelled") return current;
    return this.receivables.update(id, { status: "cancelled" });
  }

  async reopen(id: string): Promise<Receivable> {
    const current = await this.getById(id);
    if (current.status !== "cancelled") throw new ReceivableStatusTransitionError("Só é possível reabrir um título cancelado.");
    const status = recomputeReceivableStatus("open", current.originalAmount, current.balance);
    return this.receivables.update(id, { status });
  }

  /**
   * Recebimento parcial padrão: NUNCA sobrescreve recebimentos
   * anteriores, nunca quita automaticamente uma diferença — se o valor
   * for menor que o saldo, o título fica (ou permanece)
   * parcialmente pago.
   */
  async addReceipt(receivableId: string, input: ReceiptInput): Promise<ReceivableReceipt> {
    const current = await this.getById(receivableId);
    if (current.status === "cancelled") throw new ReceivableValidationError("Não é possível registrar recebimento num título cancelado.");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ReceivableValidationError("Informe um valor de recebimento válido.");
    if (input.amount > current.balance) {
      throw new ReceivableValidationError(
        `O recebimento (${input.amount}) não pode ser maior que o saldo atual (${current.balance}). Para dispensar a diferença, use "Quitar com diferença".`,
      );
    }

    const receipt = await this.receivables.addReceipt({
      receivableId,
      amount: input.amount,
      receivedAt: input.receivedAt,
      paymentMethod: input.paymentMethod,
      reference: trimOrUndefined(input.reference),
      notes: trimOrUndefined(input.notes),
      receivedByProfileId: input.receivedByProfileId,
    });

    const newBalance = current.balance - input.amount;
    const status = recomputeReceivableStatus(current.status, current.originalAmount, newBalance);
    await this.receivables.update(receivableId, { status });

    return receipt;
  }

  /**
   * "Quitar com diferença" (item 7) — NUNCA automático. Registra o
   * valor recebido como ReceivableReceipt normal e a diferença
   * dispensada como ReceivableAdjustment (adjustmentType=
   * settlement_difference), deixando o saldo em zero e o título
   * quitado. O usuário escolhe explicitamente este fluxo — nunca é
   * inferido de um recebimento parcial comum.
   */
  async settleWithDifference(
    receivableId: string,
    input: { receivedAmount: number; receivedAt: string; paymentMethod?: PaymentMethod; reference?: string; notes?: string; receivedByProfileId?: string; reason: string; authorizedByProfileId?: string },
  ): Promise<{ receipt: ReceivableReceipt; adjustment: ReceivableAdjustment }> {
    const current = await this.getById(receivableId);
    if (current.status === "cancelled") throw new ReceivableValidationError("Não é possível quitar um título cancelado.");
    if (!Number.isFinite(input.receivedAmount) || input.receivedAmount <= 0) throw new ReceivableValidationError("Informe um valor de recebimento válido.");
    if (input.receivedAmount > current.balance) throw new ReceivableValidationError("O valor recebido não pode ser maior que o saldo atual.");
    const difference = current.balance - input.receivedAmount;
    if (difference <= 0) throw new ReceivableValidationError('Não há diferença a dispensar — use o recebimento comum.');
    if (!input.reason.trim()) throw new ReceivableValidationError("Informe o motivo da diferença dispensada.");

    const receipt = await this.receivables.addReceipt({
      receivableId,
      amount: input.receivedAmount,
      receivedAt: input.receivedAt,
      paymentMethod: input.paymentMethod,
      reference: trimOrUndefined(input.reference),
      notes: trimOrUndefined(input.notes),
      receivedByProfileId: input.receivedByProfileId,
    });

    const adjustment = await this.receivables.addAdjustment({
      receivableId,
      amount: difference,
      adjustmentType: "settlement_difference",
      reason: input.reason.trim(),
      authorizedByProfileId: input.authorizedByProfileId,
      notes: undefined,
    });

    await this.receivables.update(receivableId, { status: "paid" });

    return { receipt, adjustment };
  }

  /** Abatimento/desconto avulso (item 8) — reason sempre obrigatório. */
  async addAdjustment(receivableId: string, input: AdjustmentInput): Promise<ReceivableAdjustment> {
    const current = await this.getById(receivableId);
    if (current.status === "cancelled") throw new ReceivableValidationError("Não é possível lançar abatimento num título cancelado.");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ReceivableValidationError("Informe um valor de abatimento válido.");
    if (!input.reason.trim()) throw new ReceivableValidationError("Informe o motivo do abatimento.");
    if (input.amount > current.balance) throw new ReceivableValidationError("O abatimento não pode ser maior que o saldo atual.");

    const adjustment = await this.receivables.addAdjustment({
      receivableId,
      amount: input.amount,
      adjustmentType: input.adjustmentType,
      reason: input.reason.trim(),
      authorizedByProfileId: input.authorizedByProfileId,
      notes: trimOrUndefined(input.notes),
    });

    const newBalance = current.balance - input.amount;
    const status = recomputeReceivableStatus(current.status, current.originalAmount, newBalance);
    await this.receivables.update(receivableId, { status });

    return adjustment;
  }

  listReceipts(receivableId: string): Promise<ReceivableReceipt[]> {
    return this.receivables.listReceipts(receivableId);
  }

  listAdjustments(receivableId: string): Promise<ReceivableAdjustment[]> {
    return this.receivables.listAdjustments(receivableId);
  }

  /**
   * Estorno (item 9) — nunca apaga o registro original; só marca
   * reversed_at/reversed_by/reversal_reason (uma única vez) e
   * recalcula o status do título a partir do saldo sem esse
   * recebimento/abatimento.
   */
  async reverseReceipt(receivableId: string, receiptId: string, reversedByProfileId: string, reason: string): Promise<ReceivableReceipt> {
    if (!reason.trim()) throw new ReceivableValidationError("Informe o motivo do estorno.");
    const current = await this.getById(receivableId);
    const reversed = await this.receivables.reverseReceipt(receiptId, { reversedByProfileId, reversalReason: reason.trim() });
    const newBalance = current.balance + reversed.amount;
    const status = recomputeReceivableStatus(current.status === "cancelled" ? "open" : current.status, current.originalAmount, newBalance);
    await this.receivables.update(receivableId, { status });
    return reversed;
  }

  async reverseAdjustment(receivableId: string, adjustmentId: string, reversedByProfileId: string, reason: string): Promise<ReceivableAdjustment> {
    if (!reason.trim()) throw new ReceivableValidationError("Informe o motivo do estorno.");
    const current = await this.getById(receivableId);
    const reversed = await this.receivables.reverseAdjustment(adjustmentId, { reversedByProfileId, reversalReason: reason.trim() });
    const newBalance = current.balance + reversed.amount;
    const status = recomputeReceivableStatus(current.status === "cancelled" ? "open" : current.status, current.originalAmount, newBalance);
    await this.receivables.update(receivableId, { status });
    return reversed;
  }
}
