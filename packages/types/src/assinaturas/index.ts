// Módulo Assinaturas (estrutura inicial) — vínculo de serviços (impresso/
// digital/TV) a um Cliente já cadastrado (módulo Clientes). Um mesmo
// cliente pode ter mais de uma assinatura simultânea (ex.: impresso + TV).
// Cobrança/contas a receber/baixa de pagamento são módulos futuros
// (Financeiro) que vão referenciar subscriptionId — nenhum campo
// financeiro de verdade (parcelas, boletos, baixa) entra aqui ainda.

export type SubscriptionServiceType = "impresso" | "digital" | "tv";
export type SubscriptionStatus = "active" | "suspended" | "cancelled";
export type SubscriptionPeriodicity = "monthly" | "quarterly" | "semiannual" | "annual";

export const SUBSCRIPTION_SERVICE_TYPES: readonly SubscriptionServiceType[] = ["impresso", "digital", "tv"];
export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = ["active", "suspended", "cancelled"];
export const SUBSCRIPTION_PERIODICITIES: readonly SubscriptionPeriodicity[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];

export const SUBSCRIPTION_SERVICE_TYPE_LABELS: Record<SubscriptionServiceType, string> = {
  impresso: "Impresso",
  digital: "Digital",
  tv: "TV",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

export const SUBSCRIPTION_PERIODICITY_LABELS: Record<SubscriptionPeriodicity, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export interface Subscription {
  id: string;
  reference: string;
  clientId: string;
  serviceType: SubscriptionServiceType;
  status: SubscriptionStatus;
  /** Valor em reais (ex.: 49.9), nunca centavos — mantido simples nesta fase estrutural; Financeiro decide a representação de cobrança. */
  amount: number;
  periodicity: SubscriptionPeriodicity;
  /** Data (YYYY-MM-DD) em que a assinatura começou a vigorar. */
  startsAt: string;
  /** Próximo vencimento — opcional nesta fase (sem cobrança automática ainda). */
  dueDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Rótulo curto pra listagens/cards — tipo de serviço + periodicidade. */
export function subscriptionSummaryLabel(subscription: Pick<Subscription, "serviceType" | "periodicity">): string {
  return `${SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]} · ${SUBSCRIPTION_PERIODICITY_LABELS[subscription.periodicity]}`;
}
