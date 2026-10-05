import type { ContractStatus } from "@ir/types";

export interface ContractFormPayload {
  clientId: string;
  contractNumber: string;
  processNumber: string;
  modality: string;
  biddingReference: string;
  object: string;
  contractedAmount: string;
  startsAt: string;
  endsAt: string;
  status: ContractStatus;
  notes: string;
}

export function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Poucos campos obrigatórios de propósito (Parte 3A, item 10) — cada
 * órgão trabalha de forma diferente. Só o cliente/órgão é exigido. */
export function validateContractPayload(payload: ContractFormPayload): string | null {
  if (!payload.clientId) return "Selecione o cliente/órgão deste contrato.";
  if (payload.startsAt && payload.endsAt && payload.endsAt < payload.startsAt) {
    return "O fim da vigência não pode ser anterior ao início.";
  }
  return null;
}
