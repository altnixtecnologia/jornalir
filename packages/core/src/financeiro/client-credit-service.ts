import type { ClientCredit, ClientCreditWithBalance } from "@ir/types";
import {
  ClientCreditAlreadyAppliedError,
  ClientCreditNotFoundError,
  ClientCreditValidationError,
  type ClientCreditListQuery,
  type ClientCreditRepository,
} from "./client-credit-repository";

/**
 * Crédito do cliente (Parte 3B.1) — ledger auditável, nunca um saldo
 * mutável. A criação/aplicação de crédito vive em ReceivableService
 * (addReceipt/applyAvailableCreditAutomatically/applyCreditManually),
 * já que ambas tocam receivable_adjustments; este service cobre
 * listagem/consulta e o estorno do crédito em si (item 14).
 */
export class ClientCreditService {
  constructor(private readonly credits: ClientCreditRepository) {}

  list(query?: ClientCreditListQuery): Promise<ClientCreditWithBalance[]> {
    return this.credits.list(query);
  }

  async getById(id: string): Promise<ClientCreditWithBalance> {
    const credit = await this.credits.getById(id);
    if (!credit) throw new ClientCreditNotFoundError(id);
    return credit;
  }

  /**
   * Estorno do crédito em si (item 14) — nunca apaga, só marca
   * reversed_*. Bloqueado (ClientCreditAlreadyAppliedError) se parte do
   * crédito já foi aplicada em algum título: um estorno destrutivo
   * automático desfaria uma aplicação já consolidada em outro título,
   * então exige tratamento explícito (reverter as aplicações
   * específicas primeiro, ver ReceivableService.reverseAdjustment).
   */
  async reverse(id: string, reversedByProfileId: string, reason: string): Promise<ClientCredit> {
    if (!reason.trim()) throw new ClientCreditValidationError("Informe o motivo do estorno.");
    const current = await this.getById(id);
    if (current.reversedAt) return current;
    if (current.totalApplied > 0) throw new ClientCreditAlreadyAppliedError(id, current.totalApplied);
    return this.credits.reverse(id, { reversedByProfileId, reversalReason: reason.trim() });
  }
}
