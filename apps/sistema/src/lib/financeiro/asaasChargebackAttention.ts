/**
 * Alerta humano para chargeback informado pelo Asaas (cartão).
 *
 * Um chargeback NÃO autoriza estorno de recibo, ajuste de saldo, crédito ou suspensão automática:
 * valores, disputa e vínculos precisam ser conciliados. Reaproveita a notificação "system" já permitida
 * pelo banco (mesmo princípio do estorno). A chave é por evento: reentregas não criam alerta novo.
 */
export type AsaasChargebackEvent =
  | "PAYMENT_CHARGEBACK_REQUESTED"
  | "PAYMENT_CHARGEBACK_DISPUTE"
  | "PAYMENT_AWAITING_CHARGEBACK_REVERSAL";

export const ASAAS_CHARGEBACK_EVENTS: readonly string[] = [
  "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
];

export function isAsaasChargebackEvent(eventType: string): eventType is AsaasChargebackEvent {
  return ASAAS_CHARGEBACK_EVENTS.includes(eventType);
}

const MESSAGES: Record<AsaasChargebackEvent, { title: string; message: string }> = {
  PAYMENT_CHARGEBACK_REQUESTED: {
    title: "Chargeback no Asaas — conciliação necessária",
    message: "O Asaas informou um chargeback de pagamento por cartão. Confira o título, o recibo e o serviço antes de qualquer ajuste manual; nada foi alterado automaticamente.",
  },
  PAYMENT_CHARGEBACK_DISPUTE: {
    title: "Chargeback em disputa no Asaas",
    message: "O chargeback entrou em disputa (documentos de contestação apresentados). Acompanhe no Asaas; nenhum ajuste local foi feito automaticamente.",
  },
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: {
    title: "Chargeback revertido, aguardando repasse",
    message: "A disputa foi vencida e o Asaas aguarda o repasse da adquirente. Confira o título e o recibo antes de qualquer ajuste manual.",
  },
};

export function buildAsaasChargebackAttention(eventType: AsaasChargebackEvent, eventId: string, receivableId: string) {
  return {
    kind: "system" as const,
    // Sem valores, documentos ou dados do pagador em notificação compartilhada.
    title: MESSAGES[eventType].title,
    message: MESSAGES[eventType].message,
    href: `/sistema/financeiro/contas-a-receber/${receivableId}`,
    entityId: receivableId,
    eventKey: `asaas:${eventId}:chargeback_reconciliation`,
  };
}
