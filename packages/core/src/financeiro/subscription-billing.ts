import { addPeriodicityInterval, computeNextDueDate, subscriptionSummaryLabel, type Subscription } from "@ir/types";
import type { ReceivableInput } from "./receivable-service";

/**
 * Geração manual de títulos a partir de Assinaturas (Parte 3B) — reusa
 * as regras JÁ existentes do módulo Assinaturas (computeNextDueDate,
 * periodicidade), nunca duplica. Puro/sem banco: usado tanto pela
 * prévia (antes de confirmar) quanto pela geração real.
 */

export interface SubscriptionReceivableDraft {
  competencyDate: string;
  dueDate: string;
  input: ReceivableInput;
}

/** Monta o título sugerido para UMA competência — nunca grava nada; quem chama decide o que fazer com o draft (mostrar prévia, confirmar, editar). */
export function buildReceivableFromSubscription(subscription: Subscription, competencyDate: string): SubscriptionReceivableDraft {
  const dueDate = subscription.dueDay ? computeNextDueDate(competencyDate, subscription.dueDay) : competencyDate;
  return {
    competencyDate,
    dueDate,
    input: {
      clientId: subscription.clientId,
      description: `Assinatura ${subscriptionSummaryLabel(subscription)} — competência ${competencyDate.slice(0, 7)}`,
      sourceType: "subscription",
      sourceId: subscription.id,
      sourceReference: `Assinatura ${subscription.reference}`,
      subscriptionId: subscription.id,
      originalAmount: subscription.amount,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate,
      competencyDate,
    },
  };
}

/**
 * Prévia de N competências a partir de uma data inicial — avança pela
 * periodicidade da própria assinatura (addPeriodicityInterval). Só
 * monta os drafts; a confirmação real (com checagem de duplicidade por
 * competência) é responsabilidade do ReceivableService.
 */
export function buildReceivablesForPeriod(subscription: Subscription, count: number, firstCompetencyDate: string): SubscriptionReceivableDraft[] {
  const drafts: SubscriptionReceivableDraft[] = [];
  let competency = firstCompetencyDate;
  for (let index = 0; index < count; index += 1) {
    drafts.push(buildReceivableFromSubscription(subscription, competency));
    competency = addPeriodicityInterval(competency, subscription.periodicity, 1);
  }
  return drafts;
}

/** Sugestão de competência inicial pra "gerar próxima cobrança" — usa nextDueDate quando existir, senão a data de início. Nunca grava/atualiza a assinatura. */
export function suggestNextCompetencyDate(subscription: Subscription): string {
  return subscription.nextDueDate ?? subscription.startsAt;
}
