/**
 * Política dos eventos do Asaas para cobranças de CARTÃO (pura, sem I/O).
 *
 * Modelo contábil (o existente é preservado): bruto = `payment_charges.amount` e recibo; o líquido informado
 * pelo provedor na liquidação é só registro. Para cartão:
 *  - PAYMENT_CONFIRMED = pagamento efetuado, saldo ainda não disponível → gera a baixa (recibo) uma única vez
 *    (modelo padrão), a menos que ASAAS_CARD_RECEIPT_ON_RECEIVED=true mantenha a baixa só na liquidação;
 *  - PAYMENT_RECEIVED = liquidação (~32 dias) → só registra data e valor líquido quando já houve baixa;
 *  - recusa (captura recusada / reprovado na análise) → registra e mantém a cobrança pendente;
 *  - estorno e chargeback → atenção humana, nunca ajuste automático de saldo, recibo ou serviço.
 * Pix mantém o comportamento anterior (baixa só em PAYMENT_RECEIVED).
 */
export type CardEventInput = {
  eventType: string;
  isCard: boolean;
  chargeStatus: string;
  /** ASAAS_CARD_RECEIPT_ON_RECEIVED=true: baixa só na liquidação (modelo estrito). */
  strictSettlement: boolean;
};

export type CardEventPlan = {
  /** Tenta a baixa atômica (confirm_payment_charge, idempotente por status). */
  settle: boolean;
  /** Liquidação de cartão já baixado: só marcos (data/valor líquido); sem novo recibo nem aviso. */
  settlementOnly: boolean;
  markConfirmed: boolean;
  markSettled: boolean;
  markRejected: boolean;
  attention: "refund" | "chargeback" | null;
};

const REFUSED = ["PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS"];
const REFUND = ["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"];
const CHARGEBACK = ["PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"];

export function cardWebhookPlan(input: CardEventInput): CardEventPlan {
  const { eventType, isCard } = input;
  const received = eventType === "PAYMENT_RECEIVED";
  const confirmed = eventType === "PAYMENT_CONFIRMED";
  return {
    settle: received || (confirmed && isCard && !input.strictSettlement),
    settlementOnly: isCard && received && input.chargeStatus === "paid",
    markConfirmed: isCard && (confirmed || received),
    markSettled: isCard && received,
    markRejected: isCard && REFUSED.includes(eventType),
    attention: REFUND.includes(eventType) ? "refund" : CHARGEBACK.includes(eventType) ? "chargeback" : null,
  };
}
