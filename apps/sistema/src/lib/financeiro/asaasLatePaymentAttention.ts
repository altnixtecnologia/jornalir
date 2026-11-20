/**
 * Conciliação de PAYMENT_RECEIVED quando o registro local da cobrança
 * não está mais pagável. Não é autorização para baixa/estorno automático.
 *
 * Reutiliza admin_notifications do sistema, sem tabela paralela.
 * A chave da notificação é por COBRANÇA, pois duas entregas com IDs de
 * eventos diferentes podem se referir ao mesmo pagamento tardio.
 */
export function needsManualAsaasPaymentReconciliation(status: string): boolean {
  // "paid" é idempotente na RPC confirm_payment_charge; "pending" pode
  // ser baixado pela RPC. Todos os demais estados ficam para revisão.
  return status !== "pending" && status !== "paid";
}

export interface AsaasLatePaymentAttention {
  kind: "system";
  title: string;
  message: string;
  href: string;
  entityId: string;
  eventKey: string;
}

export function buildAsaasLatePaymentAttention(
  chargeId: string,
  receivableId: string,
): AsaasLatePaymentAttention {
  return {
    kind: "system",
    title: "Pagamento Asaas após encerramento — conciliar",
    message: "O Asaas comunicou pagamento para uma cobrança que já estava encerrada no Jornal IR. Confira a situação no provedor, o título, os recibos e os créditos antes de qualquer baixa manual. Nenhum valor foi ajustado automaticamente.",
    href: `/sistema/financeiro/contas-a-receber/${receivableId}`,
    entityId: receivableId,
    eventKey: `asaas:charge:${chargeId}:late_payment_reconciliation`,
  };
}
