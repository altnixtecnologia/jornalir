import type { SubscriptionPeriodicity, SubscriptionServiceType, SubscriptionStatus } from "@ir/types";

export interface SubscriptionFormPayload {
  clientId: string;
  serviceType: SubscriptionServiceType;
  status: SubscriptionStatus;
  amount: string;
  periodicity: SubscriptionPeriodicity;
  startsAt: string;
  dueDate: string;
  notes: string;
}

function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

/** Mesma validação usada pela Server Action e pelo formulário — fonte
 * única, mesmo princípio de validateClientPayload/validateArticlePayload. */
export function validateSubscriptionPayload(payload: SubscriptionFormPayload): string | null {
  if (!payload.clientId) return "Selecione o cliente desta assinatura.";
  const amount = parseAmount(payload.amount);
  if (payload.amount.trim() === "" || !Number.isFinite(amount) || amount < 0) return "Informe um valor válido.";
  if (!payload.startsAt) return "Informe a data de início.";
  if (payload.dueDate && payload.dueDate < payload.startsAt) return "O vencimento não pode ser anterior ao início.";
  return null;
}

export { parseAmount };
