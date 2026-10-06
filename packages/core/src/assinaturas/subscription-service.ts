import {
  canTransitionSubscriptionStatus,
  computeNextDueDate,
  type Subscription,
  type SubscriptionPeriodicity,
  type SubscriptionPrintDelivery,
  type SubscriptionServiceType,
  type SubscriptionStatus,
  type SubscriptionTvIntegration,
} from "@ir/types";
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

/** Tentativa de transição de status não permitida (ex.: reativar uma
 * cancelada) — cancelada é estado final, nunca volta a ativa/suspensa. */
export class SubscriptionStatusTransitionError extends Error {}

export interface SubscriptionInput {
  clientId: string;
  serviceType: SubscriptionServiceType;
  status?: SubscriptionStatus;
  amount: number;
  periodicity: SubscriptionPeriodicity;
  startsAt: string;
  dueDay?: number;
  /** Se omitido na criação, é sugerido a partir de startsAt+dueDay (computeNextDueDate). Sempre ajustável manualmente depois. */
  nextDueDate?: string;
  endsAt?: string;
  print?: SubscriptionPrintDelivery;
  tv?: SubscriptionTvIntegration;
  notes?: string;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Dados específicos do serviço nunca "sobram" pro tipo errado — trocar
 * de impresso pra digital, por exemplo, sempre limpa os campos de
 * entrega impressa (mesmo princípio de ClientService.normalizeFields
 * limpando campos do kind anterior). */
function normalizePrint(serviceType: SubscriptionServiceType, print: SubscriptionPrintDelivery | undefined): SubscriptionPrintDelivery | undefined {
  if (serviceType !== "impresso") return undefined;
  return {
    copies: print && Number.isFinite(print.copies) && print.copies >= 1 ? Math.floor(print.copies) : 1,
    addressZip: trimOrUndefined(print?.addressZip),
    addressStreet: trimOrUndefined(print?.addressStreet),
    addressNumber: trimOrUndefined(print?.addressNumber),
    addressComplement: trimOrUndefined(print?.addressComplement),
    addressNeighborhood: trimOrUndefined(print?.addressNeighborhood),
    addressCity: trimOrUndefined(print?.addressCity),
    addressState: print?.addressState?.trim().toUpperCase().slice(0, 2) || undefined,
  };
}

function normalizeTv(serviceType: SubscriptionServiceType, tv: SubscriptionTvIntegration | undefined): SubscriptionTvIntegration | undefined {
  if (serviceType !== "tv") return undefined;
  const normalized: SubscriptionTvIntegration = {
    externalSource: trimOrUndefined(tv?.externalSource),
    externalClientReference: trimOrUndefined(tv?.externalClientReference),
    externalDeviceReference: trimOrUndefined(tv?.externalDeviceReference),
  };
  const isEmpty = !normalized.externalSource && !normalized.externalClientReference && !normalized.externalDeviceReference;
  return isEmpty ? undefined : normalized;
}

function normalize(input: SubscriptionInput): NewSubscriptionRecord {
  const dueDay = input.dueDay && input.dueDay >= 1 && input.dueDay <= 31 ? Math.floor(input.dueDay) : undefined;
  const nextDueDate = input.nextDueDate || (dueDay ? computeNextDueDate(input.startsAt, dueDay) : undefined);
  return {
    clientId: input.clientId,
    serviceType: input.serviceType,
    status: input.status ?? "active",
    amount: input.amount,
    periodicity: input.periodicity,
    startsAt: input.startsAt,
    dueDay,
    nextDueDate,
    endsAt: input.endsAt || undefined,
    print: normalizePrint(input.serviceType, input.print),
    tv: normalizeTv(input.serviceType, input.tv),
    notes: input.notes?.trim() || undefined,
  };
}

/** Barreira de validação no próprio domínio — nunca confia só na UI/Server
 * Action, mesmo princípio de ClientService.assertValidDocuments. */
function assertValid(record: Pick<NewSubscriptionRecord, "clientId" | "amount" | "startsAt" | "endsAt" | "print">): void {
  if (!record.clientId) throw new SubscriptionValidationError("Selecione o cliente desta assinatura.");
  if (!Number.isFinite(record.amount) || record.amount < 0) throw new SubscriptionValidationError("Informe um valor válido.");
  if (!record.startsAt) throw new SubscriptionValidationError("Informe a data de início.");
  if (record.endsAt && record.endsAt < record.startsAt) {
    throw new SubscriptionValidationError("A data de encerramento não pode ser anterior ao início.");
  }
  if (record.print && record.print.copies < 1) {
    throw new SubscriptionValidationError("A quantidade de exemplares deve ser pelo menos 1.");
  }
}

/**
 * Estrutura operacional do módulo Assinaturas (Parte 2B): vínculo
 * cliente/serviço/status/valor/periodicidade/datas/observações, dados
 * específicos de impresso/TV, e as transições de status (ativa <->
 * suspensa, qualquer uma -> cancelada, cancelada é final). Cobrança,
 * contas a receber e baixa de pagamento continuam sendo módulos futuros
 * (Financeiro) que vão referenciar o id desta assinatura.
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
    const current = await this.getById(id);
    const changes: SubscriptionChanges = normalize(input);
    assertValid(changes as Pick<NewSubscriptionRecord, "clientId" | "amount" | "startsAt" | "endsAt" | "print">);
    if (changes.status && changes.status !== current.status && !canTransitionSubscriptionStatus(current.status, changes.status)) {
      throw new SubscriptionStatusTransitionError(
        `Não é possível mudar o status de "${current.status}" para "${changes.status}".`,
      );
    }
    // Edição geral nunca limpa cancelledAt/cancellationReason por fora da
    // transição dedicada — só suspend()/reactivate()/cancel() tocam esses
    // dois campos, pra não perder o histórico de cancelamento à toa.
    return this.subscriptions.update(id, changes);
  }

  private async transition(id: string, to: SubscriptionStatus, extra: Partial<SubscriptionChanges> = {}): Promise<Subscription> {
    const current = await this.getById(id);
    if (!canTransitionSubscriptionStatus(current.status, to)) {
      throw new SubscriptionStatusTransitionError(
        `Não é possível mudar o status de "${current.status}" para "${to}".`,
      );
    }
    return this.subscriptions.update(id, { status: to, ...extra });
  }

  suspend(id: string): Promise<Subscription> {
    return this.transition(id, "suspended");
  }

  reactivate(id: string): Promise<Subscription> {
    return this.transition(id, "active");
  }

  cancel(id: string, reason?: string): Promise<Subscription> {
    return this.transition(id, "cancelled", {
      cancelledAt: new Date().toISOString(),
      cancellationReason: trimOrUndefined(reason),
    });
  }
}
