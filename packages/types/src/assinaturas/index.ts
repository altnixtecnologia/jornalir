// Módulo Assinaturas — vínculo de serviços (impresso/digital/TV) a um
// Cliente já cadastrado (módulo Clientes). Um mesmo cliente pode ter mais
// de uma assinatura simultânea (ex.: impresso + TV). Cobrança/contas a
// receber/baixa de pagamento são módulos futuros (Financeiro) que vão
// referenciar subscriptionId — nenhum campo financeiro de verdade
// (parcelas, boletos, baixa) entra aqui ainda.

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

/** Transições de status permitidas (Parte 2B): cancelada é estado final —
 * nunca volta a ativa/suspensa. Para retomar o serviço, cria-se uma nova
 * assinatura. Usada tanto pela validação de domínio quanto pela UI (pra
 * decidir quais ações de transição mostrar). */
export const SUBSCRIPTION_STATUS_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  active: ["suspended", "cancelled"],
  suspended: ["active", "cancelled"],
  cancelled: [],
};

export function canTransitionSubscriptionStatus(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return SUBSCRIPTION_STATUS_TRANSITIONS[from].includes(to);
}

/** Entrega do serviço Impresso — só relevante quando serviceType==="impresso".
 * Endereço próprio da assinatura (pode diferir do endereço do cliente). */
export interface SubscriptionPrintDelivery {
  copies: number;
  addressZip?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
}

/** Referências externas genéricas pra um vínculo futuro com o Altnix
 * Informativo — nunca uma integração real (sem FK, sem consulta a outro
 * banco, sem API). Só relevante quando serviceType==="tv". */
export interface SubscriptionTvIntegration {
  externalSource?: string;
  externalClientReference?: string;
  externalDeviceReference?: string;
}

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
  /** Dia preferencial de cobrança (1-31) — só estrutura; "mês sem esse dia usa o último dia válido" é regra do Financeiro. */
  dueDay?: number;
  /** Próxima competência/cobrança esperada — sugerida a partir de startsAt+dueDay, ajustável manualmente, atualizada pelo Financeiro quando cobranças forem geradas. */
  nextDueDate?: string;
  /** Encerramento PROGRAMADO, opcional — distinto de status="cancelled"; nunca cancela nada automaticamente (sem automação ainda). */
  endsAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  /** Só preenchido quando serviceType === "impresso". */
  print?: SubscriptionPrintDelivery;
  /** Só preenchido quando serviceType === "tv". */
  tv?: SubscriptionTvIntegration;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Rótulo curto pra listagens/cards — tipo de serviço + periodicidade. */
export function subscriptionSummaryLabel(subscription: Pick<Subscription, "serviceType" | "periodicity">): string {
  return `${SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]} · ${SUBSCRIPTION_PERIODICITY_LABELS[subscription.periodicity]}`;
}

/** Sugestão de próximo vencimento a partir do início + dia preferencial —
 * mesma regra que o Financeiro vai reaplicar depois: quando o mês não tem
 * esse dia, usa o último dia válido do mês (ex.: dia 31 em abril -> 30).
 * Só uma SUGESTÃO no cadastro; sempre ajustável manualmente. */
export function computeNextDueDate(startsAt: string, dueDay: number): string {
  const start = new Date(`${startsAt}T00:00:00`);
  const year = start.getFullYear();
  const month = start.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, Math.floor(dueDay)), lastDayOfMonth);
  const candidate = new Date(year, month, day);
  // Se o dia de vencimento já passou dentro do mês de início, a primeira
  // cobrança esperada é no mês seguinte.
  if (candidate < start) {
    const nextMonth = month + 1;
    const lastDayNextMonth = new Date(year, nextMonth + 1, 0).getDate();
    const nextDay = Math.min(Math.max(1, Math.floor(dueDay)), lastDayNextMonth);
    return new Date(year, nextMonth, nextDay).toISOString().slice(0, 10);
  }
  return candidate.toISOString().slice(0, 10);
}
