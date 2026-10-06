import type { ReceivableSourceType } from "@ir/types";

export interface ReceivableFormPayload {
  clientId: string;
  description: string;
  sourceType: ReceivableSourceType;
  sourceId: string;
  sourceReference: string;
  /** Preenchido SÓ quando sourceType === "subscription" (geração a partir de Assinatura, Parte 3B). */
  subscriptionId: string;
  contractId: string;
  originalAmount: string;
  issueDate: string;
  dueDate: string;
  competencyDate: string;
  notes: string;
}

export function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

/** Mesma validação usada pela Server Action e pelo formulário — fonte
 * única, mesmo princípio do restante do painel. */
export function validateReceivablePayload(payload: ReceivableFormPayload): string | null {
  if (!payload.clientId) return "Selecione o cliente/pagador.";
  if (!payload.description.trim()) return "Informe uma descrição.";
  const amount = parseAmount(payload.originalAmount);
  if (payload.originalAmount.trim() === "" || !Number.isFinite(amount) || amount < 0) return "Informe um valor original válido.";
  if (!payload.issueDate) return "Informe a data de emissão.";
  if (!payload.dueDate) return "Informe o vencimento.";
  if (payload.dueDate < payload.issueDate) return "O vencimento não pode ser anterior à emissão.";
  return null;
}
