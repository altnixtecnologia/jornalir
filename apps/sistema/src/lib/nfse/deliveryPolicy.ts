/** Regras puras, compartilhadas pelos componentes e pela fila de NFS-e. */
export type DeliveryStatus =
  | "queued" | "processing" | "accepted" | "delivered" | "bounced"
  | "failed" | "uncertain" | "missing_recipient" | "opened" | "operator_confirmed";
export type DeliveryChannel = "email" | "whatsapp";
export interface NfseDeliveryEvent {
  id: string;
  issuedNoteId: string;
  channel: DeliveryChannel;
  origin: "automatic" | "manual";
  status: DeliveryStatus;
  recipientSnapshot?: string;
  providerMessageId?: string;
  requestedAt: string;
  acceptedAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  openedAt?: string;
  confirmedAt?: string;
  requestedBy?: string;
  responseSummary?: string;
}
export interface NfseDocumentAsset {
  id: string;
  kind: "nfse_xml" | "dps_xml" | "danfse_pdf" | "cancellation_xml" | "cancellation_response_xml";
  storedAt: string;
  sizeBytes: number;
  sha256: string;
}
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus,string> = {
  queued: "Aguardando envio",
  processing: "Preparando envio",
  accepted: "Aceito pelo provedor (não confirma recebimento)",
  delivered: "Entregue (confirmação do provedor)",
  bounced: "Não entregue (devolvido)",
  failed: "Falha no envio",
  uncertain: "Resultado incerto — verificar antes de reenviar",
  missing_recipient: "Sem e-mail cadastrado",
  opened: "WhatsApp aberto — envio não verificado",
  operator_confirmed: "Envio declarado pelo operador (não verificado)",
};
export function fiscalRecipient(client: { fiscalEmail?: string|null; email?: string|null }): string | null {
  const target = client.fiscalEmail?.trim() || client.email?.trim() || "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) ? target : null;
}
export function whatsappMessage(noteNumber: string): string {
  const clean = noteNumber.replace(/[\r\n\u0000-\u001f]/g," ").slice(0,80);
  return `Olá! Segue a NFS-e nº ${clean}, emitida pelo Jornal Informativo Regional. Encaminharemos o DANFSe em PDF nesta conversa.`;
}
export function whatsappComposeUrl(noteNumber: string): string {
  // Sem telefone: deixa o operador selecionar a conversa no WhatsApp.
  // NÃO disponibilizar XML/PDF privado em URL pública.
  return "https://wa.me/?text=" + encodeURIComponent(whatsappMessage(noteNumber));
}
export function canManuallyResend(status: DeliveryStatus): boolean {
  // "accepted"/"delivered" podem ser reenviados com clique expresso,
  // jamais como retry silencioso. "processing"/"queued" nao.
  return status !== "queued" && status !== "processing";
}
