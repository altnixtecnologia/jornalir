import {
  allocatePaymentAcrossReceivables,
  buildReceivableComposition,
  creditMatchesReceivableOrigin,
  planCreditApplication,
  recomputeReceivableStatus,
  splitOverpayment,
  type ClientCredit,
  type ClientCreditWithBalance,
  type PaymentMethod,
  type Receivable,
  type ReceivableAdjustment,
  type ReceivableComposition,
  type ReceivableReceipt,
  type ReceivableSourceType,
  type ReceivableWithBalance,
  type AdjustmentType,
} from "@ir/types";
import {
  ReceivableDuplicateSubscriptionChargeError,
  ReceivableValidationError,
  type NewReceivableRecord,
  type ReceivableChanges,
  type ReceivableListQuery,
  type ReceivableRepository,
} from "./receivable-repository";
import { ClientCreditNotFoundError, type ClientCreditRepository } from "./client-credit-repository";

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
  /** Preenchido SÓ quando sourceType === "subscription" — nunca por outra origem (ver ReceivableDuplicateSubscriptionChargeError). */
  subscriptionId?: string;
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

export interface CrossReceivablePaymentInput {
  amount: number;
  receivedAt: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
  receivedByProfileId?: string;
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
    subscriptionId: input.sourceType === "subscription" ? trimOrUndefined(input.subscriptionId) : undefined,
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
 * Fundação de Contas a Receber (Parte 3A) + geração de títulos (Parte
 * 3B) + crédito do cliente / saldo anterior (Parte 3B.1): títulos,
 * recebimentos parciais (nunca sobrescrevem um ao outro), abatimentos/
 * descontos (registro próprio, auditável, nunca altera o valor
 * original), crédito do cliente (ledger próprio — ver
 * client-credit-repository — nunca um saldo mutável) e estornos
 * (registro original nunca apagado, só marcado). status é sempre
 * RECALCULADO a partir do saldo (ver recomputeReceivableStatus) depois
 * de qualquer recebimento/abatimento/crédito aplicado/estorno válido —
 * nunca escolhido livremente, exceto a ação explícita de cancelar.
 */
export class ReceivableService {
  constructor(
    private readonly receivables: ReceivableRepository,
    private readonly credits: ClientCreditRepository,
  ) {}

  list(query?: ReceivableListQuery): Promise<ReceivableWithBalance[]> {
    return this.receivables.list(query);
  }

  async getById(id: string): Promise<ReceivableWithBalance> {
    const receivable = await this.receivables.getById(id);
    if (!receivable) throw new ReceivableNotFoundError(id);
    return receivable;
  }

  async register(input: ReceivableInput): Promise<Receivable> {
    const record = normalize(input);
    assertValidReceivable(record);
    const created = await this.receivables.create(record);
    await this.applyAvailableCreditAutomatically(created.id);
    return created;
  }

  /**
   * Geração manual de título a partir de uma Assinatura (Parte 3B, item
   * 2) — nunca grava duas cobranças da mesma assinatura pra mesma
   * competência: pré-checa (findBySubscriptionAndCompetency) ANTES de
   * tentar criar, e o índice único parcial do banco continua sendo a
   * proteção autoritativa mesmo se a pré-checagem perder uma corrida
   * (ex.: dois cliques quase simultâneos). Depois de criado, aplica
   * automaticamente qualquer crédito disponível da MESMA assinatura
   * (Parte 3B.1, item 16) — nunca pergunta, nunca deixa crédito parado.
   */
  async registerFromSubscription(input: ReceivableInput): Promise<Receivable> {
    if (input.sourceType !== "subscription" || !input.subscriptionId) {
      throw new ReceivableValidationError("registerFromSubscription exige sourceType=subscription e subscriptionId.");
    }
    if (!input.competencyDate) throw new ReceivableValidationError("Informe a competência desta cobrança.");

    const existing = await this.receivables.findBySubscriptionAndCompetency(input.subscriptionId, input.competencyDate);
    if (existing) throw new ReceivableDuplicateSubscriptionChargeError(input.competencyDate);

    const record = normalize(input);
    assertValidReceivable(record);
    let created: Receivable;
    try {
      created = await this.receivables.create(record);
    } catch (error) {
      // Corrida rara (dois cliques quase simultâneos) pega pela
      // constraint do banco mesmo depois de passar a pré-checagem —
      // nunca deixa a mensagem bruta do Postgres chegar na UI.
      if (error instanceof Error && error.message.includes("receivables_subscription_competency_unique")) {
        throw new ReceivableDuplicateSubscriptionChargeError(input.competencyDate);
      }
      throw error;
    }
    await this.applyAvailableCreditAutomatically(created.id);
    return created;
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
   * Recebimento parcial/total — NUNCA sobrescreve recebimentos
   * anteriores, nunca quita automaticamente uma diferença a menor (pra
   * isso existe "Quitar com diferença"). Quando o valor recebido
   * ULTRAPASSA o saldo (Parte 3B.1, item 2), a diferença nunca é
   * perdida: vira CRÉDITO do cliente, rastreável até este recebimento,
   * disponível pra aplicação automática na próxima cobrança da MESMA
   * origem (assinatura/contrato).
   */
  async addReceipt(receivableId: string, input: ReceiptInput): Promise<{ receipt?: ReceivableReceipt; credit?: ClientCredit }> {
    const current = await this.getById(receivableId);
    if (current.status === "cancelled") throw new ReceivableValidationError("Não é possível registrar recebimento num título cancelado.");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ReceivableValidationError("Informe um valor de recebimento válido.");

    const { appliedToReceivable, creditAmount } = splitOverpayment(input.amount, current.balance);

    let receipt: ReceivableReceipt | undefined;
    if (appliedToReceivable > 0) {
      receipt = await this.receivables.addReceipt({
        receivableId,
        amount: appliedToReceivable,
        receivedAt: input.receivedAt,
        paymentMethod: input.paymentMethod,
        reference: trimOrUndefined(input.reference),
        notes: trimOrUndefined(input.notes),
        receivedByProfileId: input.receivedByProfileId,
      });
      const newBalance = current.balance - appliedToReceivable;
      const status = recomputeReceivableStatus(current.status, current.originalAmount, newBalance);
      await this.receivables.update(receivableId, { status });
    }

    let credit: ClientCredit | undefined;
    if (creditAmount > 0) {
      credit = await this.credits.create({
        clientId: current.clientId,
        sourceType: current.sourceType,
        subscriptionId: current.subscriptionId,
        contractId: current.contractId,
        originReceivableId: receivableId,
        originReceiptId: receipt?.id,
        originalAmount: creditAmount,
        reason: "Pagamento acima do valor devido",
        createdByProfileId: input.receivedByProfileId,
      });
    }

    return { receipt, credit };
  }

  /**
   * Um único pagamento cobrindo vários títulos da MESMA origem (Parte
   * 3B.1, item 8) — SEMPRE aplica no título mais antigo primeiro.
   * `receivableIdsOldestFirst` já deve vir ordenado por quem chama
   * (tipicamente por competencyDate/dueDate). O que sobrar depois de
   * quitar todos os saldos informados vira crédito, mesmo princípio de
   * `addReceipt`.
   */
  async payAcrossReceivables(
    receivableIdsOldestFirst: string[],
    input: CrossReceivablePaymentInput,
  ): Promise<{ receipts: ReceivableReceipt[]; credit?: ClientCredit }> {
    if (receivableIdsOldestFirst.length === 0) throw new ReceivableValidationError("Informe ao menos um título.");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ReceivableValidationError("Informe um valor de recebimento válido.");

    const currents: ReceivableWithBalance[] = [];
    for (const id of receivableIdsOldestFirst) currents.push(await this.getById(id));

    const clientId = currents[0].clientId;
    if (currents.some((item) => item.clientId !== clientId)) throw new ReceivableValidationError("Todos os títulos devem ser do mesmo cliente.");
    if (currents.some((item) => item.status === "cancelled")) throw new ReceivableValidationError("Não é possível receber em título cancelado.");

    const { allocations, remainingPayment } = allocatePaymentAcrossReceivables(
      currents.map((item) => ({ id: item.id, balance: item.balance })),
      input.amount,
    );

    const receipts: ReceivableReceipt[] = [];
    for (const allocation of allocations) {
      const receipt = await this.receivables.addReceipt({
        receivableId: allocation.id,
        amount: allocation.amount,
        receivedAt: input.receivedAt,
        paymentMethod: input.paymentMethod,
        reference: trimOrUndefined(input.reference),
        notes: trimOrUndefined(input.notes),
        receivedByProfileId: input.receivedByProfileId,
      });
      receipts.push(receipt);
      const target = currents.find((item) => item.id === allocation.id);
      if (target) {
        const newBalance = target.balance - allocation.amount;
        const status = recomputeReceivableStatus(target.status, target.originalAmount, newBalance);
        await this.receivables.update(allocation.id, { status });
      }
    }

    let credit: ClientCredit | undefined;
    if (remainingPayment > 0) {
      const last = currents[currents.length - 1];
      credit = await this.credits.create({
        clientId: last.clientId,
        sourceType: last.sourceType,
        subscriptionId: last.subscriptionId,
        contractId: last.contractId,
        originReceivableId: last.id,
        originReceiptId: receipts[receipts.length - 1]?.id,
        originalAmount: remainingPayment,
        reason: "Pagamento acima do valor devido (títulos combinados)",
        createdByProfileId: input.receivedByProfileId,
      });
    }

    return { receipts, credit };
  }

  /**
   * "Quitar com diferença" (item 7 da Parte 3B) — NUNCA automático.
   * Registra o valor recebido como ReceivableReceipt normal e a
   * diferença dispensada como ReceivableAdjustment (adjustmentType=
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

  /** Abatimento/desconto avulso (item 8 da Parte 3B) — reason sempre
   * obrigatório. Nunca aceita adjustmentType=credit_applied por aqui —
   * esse tipo só é gravado pela aplicação automática/manual de crédito
   * (ver applyAvailableCreditAutomatically/applyCreditManually). */
  async addAdjustment(receivableId: string, input: AdjustmentInput): Promise<ReceivableAdjustment> {
    if (input.adjustmentType === "credit_applied") {
      throw new ReceivableValidationError('Use a aplicação de crédito ("Aplicar crédito"), não o abatimento manual.');
    }
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
   * Estorno (item 9 da Parte 3B) — nunca apaga o registro original; só
   * marca reversed_at/reversed_by/reversal_reason (uma única vez) e
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

  // --- Crédito do cliente (Parte 3B.1) -----------------------------------

  /** Créditos disponíveis (saldo > 0, não estornados) da MESMA origem
   * deste título, do mais antigo pro mais novo — nunca cruza origens
   * diferentes (ver creditMatchesReceivableOrigin). Avulso/publicidade/
   * outro nunca têm crédito "da mesma origem" bem definido, então
   * sempre devolve []. */
  private async listMatchingAvailableCredits(receivable: Pick<Receivable, "clientId" | "sourceType" | "subscriptionId" | "contractId">): Promise<ClientCreditWithBalance[]> {
    if (receivable.sourceType !== "subscription" && receivable.sourceType !== "institutional_contract") return [];
    const candidates = await this.credits.list({
      clientId: receivable.clientId,
      sourceType: receivable.sourceType,
      subscriptionId: receivable.subscriptionId,
      contractId: receivable.contractId,
      availableOnly: true,
    });
    return candidates
      .filter((credit) => creditMatchesReceivableOrigin(credit, receivable))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Aplicação automática de crédito disponível num título (Parte 3B.1,
   * item 3/16) — chamada sempre depois de criar um título (register/
   * registerFromSubscription), nunca pergunta ao usuário. Cada
   * aplicação passa pela RPC atômica `apply_client_credit`
   * (ver client-credit-repository.applyToReceivable) — nunca um
   * INSERT direto feito a partir de um saldo pré-calculado em
   * TypeScript, exatamente pra fechar a janela de corrida entre duas
   * chamadas concorrentes tentando consumir o mesmo crédito (ajuste de
   * integridade pós-revisão). `planCreditApplication` continua usada só
   * como ORDEM/sugestão de quanto pedir de cada crédito — o valor
   * realmente aplicado é sempre o que a RPC devolve (pode ser menor,
   * se uma operação concorrente já tiver consumido parte do saldo).
   */
  async applyAvailableCreditAutomatically(receivableId: string): Promise<ReceivableWithBalance> {
    const current = await this.getById(receivableId);
    if (current.status === "cancelled" || current.balance <= 0) return current;

    const availableCredits = await this.listMatchingAvailableCredits(current);
    const { applications } = planCreditApplication(availableCredits, current.balance);
    if (applications.length === 0) return current;

    let remainingBalance = current.balance;
    for (const application of applications) {
      if (remainingBalance <= 0) break;
      const result = await this.credits.applyToReceivable({
        creditId: application.creditId,
        receivableId,
        requestedAmount: Math.min(application.amount, remainingBalance),
        reason: "Crédito de saldo anterior aplicado automaticamente",
      });
      remainingBalance = result.receivableBalance;
    }

    return this.getById(receivableId);
  }

  /**
   * Aplicação MANUAL de um crédito específico (item 4: "permitir
   * futuramente aplicação manual" — já preparado aqui). Funciona pra
   * qualquer crédito, mesmo de outra origem (a automática é que nunca
   * cruza origens — aqui é ação explícita do usuário, então é
   * permitido). Mesma RPC atômica da aplicação automática — só muda a
   * motivação registrada.
   */
  async applyCreditManually(receivableId: string, creditId: string, amount: number, authorizedByProfileId?: string): Promise<{ appliedAmount: number }> {
    if (!Number.isFinite(amount) || amount <= 0) throw new ReceivableValidationError("Informe um valor de aplicação válido.");
    const current = await this.getById(receivableId);
    const credit = await this.credits.getById(creditId);
    if (!credit) throw new ClientCreditNotFoundError(creditId);
    const sameOrigin = creditMatchesReceivableOrigin(credit, current);

    try {
      const result = await this.credits.applyToReceivable({
        creditId,
        receivableId,
        requestedAmount: amount,
        reason: sameOrigin ? "Crédito de saldo anterior aplicado" : "Crédito de outra origem aplicado manualmente",
        authorizedByProfileId,
      });
      if (result.appliedAmount <= 0) {
        throw new ReceivableValidationError("Não há saldo disponível (do crédito ou do título) para aplicar neste momento.");
      }
      return { appliedAmount: result.appliedAmount };
    } catch (error) {
      // A RPC já valida tudo (crédito estornado, cliente diferente,
      // título cancelado) sob lock — nunca deixa a mensagem bruta do
      // Postgres chegar na UI sem passar por ReceivableValidationError.
      if (error instanceof Error) throw new ReceivableValidationError(error.message);
      throw error;
    }
  }

  /**
   * Composição do valor (Parte 3B.1, item 10/11) — VISÃO agregada pura
   * (item 15): nunca funde títulos, nunca muda valor original, nunca
   * apaga competência. Soma saldo(s) anterior(es) em aberto da MESMA
   * origem (listOpenForOrigin) e crédito disponível da MESMA origem
   * ainda não aplicado a este título (listMatchingAvailableCredits).
   */
  async getComposition(receivableId: string): Promise<{
    receivable: ReceivableWithBalance;
    priorOpen: ReceivableWithBalance[];
    availableCredits: ClientCreditWithBalance[];
    composition: ReceivableComposition;
  }> {
    const receivable = await this.getById(receivableId);

    const priorOpen =
      receivable.sourceType === "subscription" || receivable.sourceType === "institutional_contract"
        ? await this.receivables.listOpenForOrigin({
            clientId: receivable.clientId,
            sourceType: receivable.sourceType,
            subscriptionId: receivable.subscriptionId,
            contractId: receivable.contractId,
            excludeId: receivable.id,
          })
        : [];
    const priorOpenBalance = priorOpen.reduce((sum, item) => sum + item.balance, 0);

    const availableCredits = await this.listMatchingAvailableCredits(receivable);
    const availableCreditTotal = availableCredits.reduce((sum, credit) => sum + credit.balance, 0);
    const availableCreditApplicable = Math.min(availableCreditTotal, receivable.balance);

    const alreadyResolved = receivable.totalReceived + receivable.totalAdjustments;

    const composition = buildReceivableComposition({
      currentChargeLabel: "Cobrança atual",
      currentChargeAmount: receivable.originalAmount,
      priorOpenBalance,
      availableCredit: availableCreditApplicable,
      adjustmentsAmount: alreadyResolved,
    });

    return { receivable, priorOpen, availableCredits, composition };
  }
}
