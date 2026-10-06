import type { SubscriptionPeriodicity, SubscriptionServiceType, SubscriptionStatus } from "@ir/types";

export interface SubscriptionFormPayload {
  clientId: string;
  serviceType: SubscriptionServiceType;
  status: SubscriptionStatus;
  amount: string;
  periodicity: SubscriptionPeriodicity;
  startsAt: string;
  dueDay: string;
  nextDueDate: string;
  endsAt: string;
  // Impresso — só relevante quando serviceType === "impresso".
  printCopies: string;
  printAddressZip: string;
  printAddressStreet: string;
  printAddressNumber: string;
  printAddressComplement: string;
  printAddressNeighborhood: string;
  printAddressCity: string;
  printAddressState: string;
  // TV — "Integração TV", só relevante quando serviceType === "tv".
  externalSource: string;
  externalClientReference: string;
  externalDeviceReference: string;
  notes: string;
}

function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

function parseDueDay(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Mesma validação usada pela Server Action e pelo formulário — fonte
 * única, mesmo princípio de validateClientPayload/validateArticlePayload. */
export function validateSubscriptionPayload(payload: SubscriptionFormPayload): string | null {
  if (!payload.clientId) return "Selecione o cliente desta assinatura.";
  const amount = parseAmount(payload.amount);
  if (payload.amount.trim() === "" || !Number.isFinite(amount) || amount < 0) return "Informe um valor válido.";
  if (!payload.startsAt) return "Informe a data de início.";
  if (payload.dueDay.trim()) {
    const dueDay = parseDueDay(payload.dueDay);
    if (dueDay === undefined || dueDay < 1 || dueDay > 31) return "O dia de vencimento deve ser um número de 1 a 31.";
  }
  if (payload.nextDueDate && payload.nextDueDate < payload.startsAt) {
    return "O próximo vencimento não pode ser anterior ao início.";
  }
  if (payload.endsAt && payload.endsAt < payload.startsAt) {
    return "A data de encerramento não pode ser anterior ao início.";
  }
  if (payload.serviceType === "impresso" && payload.printCopies.trim()) {
    const copies = Number(payload.printCopies);
    if (!Number.isInteger(copies) || copies < 1) return "A quantidade de exemplares deve ser um número inteiro de pelo menos 1.";
  }
  return null;
}

export { parseAmount, parseDueDay };
