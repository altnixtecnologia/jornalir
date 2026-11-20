/**
 * Identidade imutável de uma entrega Asaas.
 *
 * Mesmo ID de evento não pode trocar PAYMENT_RECEIVED por PAYMENT_DELETED
 * ou apontar para outra cobrança durante reentrega. O payload original
 * é preservado em billing_webhook_events como prova/auditoria.
 */
export interface StoredAsaasEventIdentity {
  provider: string;
  event_type: string;
  provider_charge_id: string | null;
}

export interface IncomingAsaasEventIdentity {
  eventType: string;
  providerChargeId: string | null;
}

export function matchesStoredAsaasEvent(
  stored: StoredAsaasEventIdentity,
  incoming: IncomingAsaasEventIdentity,
): boolean {
  return (
    stored.provider === "asaas" &&
    stored.event_type === incoming.eventType &&
    stored.provider_charge_id === incoming.providerChargeId
  );
}
