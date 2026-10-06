import type { ClientCredit, ClientCreditWithBalance, ReceivableSourceType } from "@ir/types";

export type NewClientCreditRecord = Omit<ClientCredit, "id" | "createdAt" | "reversedAt" | "reversedByProfileId" | "reversalReason">;

export interface ClientCreditListQuery {
  clientId?: string;
  sourceType?: ReceivableSourceType;
  subscriptionId?: string;
  contractId?: string;
  /** Só créditos com saldo > 0 e não estornados — usado pela aplicação automática/manual (nunca lista crédito já esgotado como "disponível"). */
  availableOnly?: boolean;
}

export interface ClientCreditReversalInput {
  reversedByProfileId: string;
  reversalReason: string;
}

export class ClientCreditValidationError extends Error {}

/** Mesmo princípio de ReceivableNotFoundError. */
export class ClientCreditNotFoundError extends Error {
  constructor(id: string) {
    super(`Crédito não encontrado: ${id}`);
  }
}

/**
 * Estorno bloqueado porque parte (ou todo) do crédito já foi usada em
 * outra cobrança (item 14) — nunca um estorno destrutivo automático que
 * desfaria uma aplicação já consolidada em outro título. Exige
 * tratamento explícito (reverter a aplicação específica primeiro).
 */
export class ClientCreditAlreadyAppliedError extends Error {
  constructor(id: string, applied: number) {
    super(`Este crédito já teve R$ ${applied.toFixed(2)} aplicado em cobrança(s) — estorne as aplicações antes de estornar o crédito.`);
  }
}

export interface ApplyCreditInput {
  creditId: string;
  receivableId: string;
  requestedAmount: number;
  reason: string;
  authorizedByProfileId?: string;
}

export interface ApplyCreditResult {
  appliedAmount: number;
  creditRemaining: number;
  receivableBalance: number;
  receivableStatus: string;
}

export interface ClientCreditRepository {
  list(query?: ClientCreditListQuery): Promise<ClientCreditWithBalance[]>;
  getById(id: string): Promise<ClientCreditWithBalance | null>;
  create(record: NewClientCreditRecord): Promise<ClientCredit>;
  /** Nunca apaga — só marca reversed_*. Bloqueado no service quando totalApplied > 0 (ver ClientCreditAlreadyAppliedError). */
  reverse(id: string, reversal: ClientCreditReversalInput): Promise<ClientCredit>;
  /**
   * Aplicação ATÔMICA (ajuste de integridade pós-revisão) — delega pra
   * uma função de banco (RPC `apply_client_credit`) que faz lock +
   * checagem + gravação na MESMA transação, nunca uma pré-checagem em
   * TypeScript seguida de um INSERT separado (isso teria janela de
   * corrida entre duas aplicações concorrentes do mesmo crédito). Nunca
   * aplica mais do que o saldo real no momento do lock — devolve
   * exatamente quanto foi aplicado, que pode ser menor que
   * `requestedAmount` se o saldo disponível era menor.
   */
  applyToReceivable(input: ApplyCreditInput): Promise<ApplyCreditResult>;
}
