/**
 * Alerta humano para estornos informados pelo Asaas.
 *
 * Um webhook de estorno NÃO autoriza baixa, alteração de cobrança,
 * crédito ou estorno local automático: valores e vinculações precisam
 * ser conciliados antes. Usa a notificação "system" já permitida pelo
 * banco para não criar novo enum, tabela ou mecanismo paralelo.
 *
 * A chave é por evento (e não por cobrança): um estorno parcial pode
 * ocorrer várias vezes. Reentregar o mesmo evento não cria alerta novo.
 */
export type AsaasRefundEvent = "PAYMENT_REFUNDED" | "PAYMENT_PARTIALLY_REFUNDED";

export interface AsaasRefundAttention {
  kind: "system";
  title: string;
  message: string;
  href: string;
  entityId: string;
  eventKey: string;
}

export function buildAsaasRefundAttention(
  eventType: AsaasRefundEvent,
  eventId: string,
  receivableId: string,
): AsaasRefundAttention {
  const partial = eventType === "PAYMENT_PARTIALLY_REFUNDED";
  return {
    kind: "system",
    title: partial ? "Estorno parcial no Asaas — conciliação necessária" : "Estorno no Asaas — conciliação necessária",
    // Não mostrar valores, números de documento ou dados do pagador em
    // notificação compartilhada; o detalhe está no Financeiro protegido.
    message: partial
      ? "O Asaas informou um estorno parcial. Confira os valores, recibos e créditos do título antes de qualquer ajuste manual."
      : "O Asaas informou um estorno. Confira o recebimento, recibos e créditos do título antes de qualquer ajuste manual.",
    href: `/sistema/financeiro/contas-a-receber/${receivableId}`,
    entityId: receivableId,
    eventKey: `asaas:${eventId}:refund_reconciliation`,
  };
}
