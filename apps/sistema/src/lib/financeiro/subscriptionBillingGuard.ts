import type { SubscriptionStatus } from "@ir/types";

/**
 * Bloco E (02/11/2026): "criar assinatura não pode ativar serviço nem
 * gerar títulos automaticamente" — gerar cobrança (manual ou por
 * período) exige a assinatura já ativada. Extraída de
 * contas-a-receber/actions.ts (mesmo princípio de
 * commercialSaleBillingGuard.ts) só pra ser testável sem Supabase.
 */
export function validateSubscriptionForBilling(status: SubscriptionStatus): string | null {
  if (status === "pending_formalization") {
    return "Ative a assinatura antes de gerar cobrança — ela ainda está pendente de formalização.";
  }
  return null;
}
