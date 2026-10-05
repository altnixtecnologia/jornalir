import type { Subscription, SubscriptionPeriodicity, SubscriptionServiceType, SubscriptionStatus } from "@ir/types";
import {
  SubscriptionValidationError,
  type NewSubscriptionRecord,
  type SubscriptionChanges,
  type SubscriptionListQuery,
  type SubscriptionRepository,
} from "./subscription-repository";

export class SubscriptionNotFoundError extends Error {
  constructor(id: string) {
    super(`Assinatura não encontrada: ${id}`);
  }
}

export interface SubscriptionInput {
  clientId: string;
  serviceType: SubscriptionServiceType;
  status?: SubscriptionStatus;
  amount: number;
  periodicity: SubscriptionPeriodicity;
  startsAt: string;
  dueDate?: string;
  notes?: string;
}

function normalize(input: SubscriptionInput): NewSubscriptionRecord {
  return {
    clientId: input.clientId,
    serviceType: input.serviceType,
    status: input.status ?? "active",
    amount: input.amount,
    periodicity: input.periodicity,
    startsAt: input.startsAt,
    dueDate: input.dueDate || undefined,
    notes: input.notes?.trim() || undefined,
  };
}

/** Barreira de validação no próprio domínio — nunca confia só na UI/Server
 * Action, mesmo princípio de ClientService.assertValidDocuments. */
function assertValid(record: Pick<NewSubscriptionRecord, "clientId" | "amount" | "startsAt">): void {
  if (!record.clientId) throw new SubscriptionValidationError("Selecione o cliente desta assinatura.");
  if (!Number.isFinite(record.amount) || record.amount < 0) throw new SubscriptionValidationError("Informe um valor válido.");
  if (!record.startsAt) throw new SubscriptionValidationError("Informe a data de início.");
}

/**
 * Estrutura inicial do módulo Assinaturas: só o vínculo
 * cliente/serviço/status/valor/periodicidade/datas/observações. Cobrança,
 * contas a receber e baixa de pagamento são módulos futuros (Financeiro)
 * que vão referenciar o id desta assinatura — nenhuma regra de cobrança é
 * implementada aqui ainda.
 */
export class SubscriptionService {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  list(query?: SubscriptionListQuery): Promise<Subscription[]> {
    return this.subscriptions.list(query);
  }

  async getById(id: string): Promise<Subscription> {
    const subscription = await this.subscriptions.getById(id);
    if (!subscription) throw new SubscriptionNotFoundError(id);
    return subscription;
  }

  register(input: SubscriptionInput): Promise<Subscription> {
    const record = normalize(input);
    assertValid(record);
    return this.subscriptions.create(record);
  }

  async update(id: string, input: SubscriptionInput): Promise<Subscription> {
    await this.getById(id);
    const changes: SubscriptionChanges = normalize(input);
    assertValid(changes as Pick<NewSubscriptionRecord, "clientId" | "amount" | "startsAt">);
    return this.subscriptions.update(id, changes);
  }
}
