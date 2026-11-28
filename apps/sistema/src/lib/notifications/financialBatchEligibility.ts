import { resolveClientWhatsappRecipient, WHATSAPP_RECIPIENT_MESSAGES } from "@ir/core";
import { buildTemplateParams, type ManualEvent } from "./whatsappTemplates";
import { BATCH_KIND_LABEL, type BatchKind } from "./financialBatchLabels";
export { BATCH_KIND_LABEL, type BatchKind };

/**
 * Elegibilidade do envio MANUAL em lote por tipo de mensagem. Cada cliente recebe uma mensagem
 * individual (não existe grupo de WhatsApp). Regras por tipo — a restrição de "título não pago" vale só
 * para cobrança; confirmação e recibo exigem justamente pagamento/recibo existentes:
 *
 *  - billing:      título aberto com saldo e Pix vigente já existente (nunca cria cobrança);
 *  - confirmation: pagamento confirmado (Pix ou cartão; cobrança paga) — autoritativo;
 *  - receipt:      recibo existente e não estornado.
 * Em todos: cliente ativo, WhatsApp canônico válido, título de teste excluído e sem envio igual recente.
 */
export const BATCH_KIND_EVENT: Record<BatchKind, ManualEvent> = {
  billing: "manual_billing", confirmation: "manual_confirmation", receipt: "manual_receipt",
};

type Charge = { paymentMethod?: string; status: string; amount: number; provider?: string; providerChargeId?: string; publicToken?: string; expiresAt?: string; paidAt?: string };

export type BatchCandidateInput = {
  kind: BatchKind;
  now: number;
  portalUrl: string;
  receivable: { id: string; status: string; balance: number; dueDate: string; reference: string; excludedFromReports: boolean };
  client: { id: string; name: string; active: boolean; whatsapp: string | null };
  pendingCharge?: Charge | null;
  paidCharge?: Charge | null;
  receipt?: { id: string; amount: number; reversed: boolean } | null;
  /** Já existe registro do MESMO tipo para este título hoje (uma mensagem manual por tipo, título e dia). */
  recentSent: boolean;
};

export type BatchCandidateDecision =
  | { eligible: true; phoneMasked: string; e164: string; params: string[]; entityType: "receivable" | "receipt"; entityId: string }
  | { eligible: false; reason: string; phoneMasked: string | null };

/** (48) •••••-2222 — o operador identifica o destinatário sem expor o número completo. */
export function maskWhatsapp(national: string): string {
  return `(${national.slice(0, 2)}) •••••-${national.slice(-4)}`;
}

export function evaluateBatchCandidate(input: BatchCandidateInput): BatchCandidateDecision {
  const { kind, receivable, client } = input;
  const recipient = resolveClientWhatsappRecipient({ whatsapp: client.whatsapp });
  const phoneMasked = recipient.ok ? maskWhatsapp(recipient.national) : null;
  const no = (reason: string): BatchCandidateDecision => ({ eligible: false, reason, phoneMasked });

  if (!client.active) return no("Cadastro do cliente inativo.");
  if (!recipient.ok) return no(WHATSAPP_RECIPIENT_MESSAGES[recipient.reason]);
  if (receivable.excludedFromReports) return no("Título classificado como teste: não recebe mensagens de clientes.");
  if (input.recentSent) return no("Mensagem deste tipo já enviada ou em andamento hoje para este título.");

  let entityType: "receivable" | "receipt" = "receivable";
  let entityId = receivable.id;
  let params: string[];
  if (kind === "billing") {
    if (receivable.status === "cancelled") return no("Título cancelado.");
    if (receivable.status === "paid" || receivable.balance <= 0) return no("Título já quitado: use confirmação ou recibo.");
    const pending = input.pendingCharge;
    if (!pending?.publicToken) return no("Sem Pix vigente. Gere o Pix antes de enviar (o envio nunca cria cobrança).");
    if (pending.provider === "asaas" && !pending.providerChargeId) return no("Pix pendente de conciliação no Asaas.");
    if (pending.expiresAt && Date.parse(pending.expiresAt) < input.now) return no("O Pix expirou. Gere um novo Pix antes de enviar.");
    params = buildTemplateParams("manual_billing", {
      name: client.name, reference: receivable.reference, amount: pending.amount, dueDate: receivable.dueDate,
      paymentUrl: `https://controle.altnix.com.br/pagamento/${pending.publicToken}`,
    });
  } else if (kind === "confirmation") {
    const paid = input.paidCharge;
    if (!paid || paid.status !== "paid") return no("Sem pagamento confirmado (Pix ou cartão) neste título.");
    params = buildTemplateParams("manual_confirmation", {
      name: client.name, reference: receivable.reference, amount: paid.amount, methodLabel: paid.paymentMethod === "credit_card" ? "Cartão de crédito" : "PIX",
      transactionId: paid.providerChargeId ?? "-",
    });
  } else {
    const receipt = input.receipt;
    if (!receipt || receipt.reversed) return no("Sem recibo existente (ou recibo estornado).");
    entityType = "receipt";
    entityId = receipt.id;
    params = buildTemplateParams("manual_receipt", {
      name: client.name, reference: receivable.reference, amount: receipt.amount, portalUrl: input.portalUrl,
    });
  }
  return { eligible: true, phoneMasked: phoneMasked!, e164: (recipient as { e164: string }).e164, params, entityType, entityId };
}

/** Janela de ocorrência manual: no máximo uma mensagem manual do mesmo tipo por título e por dia civil. */
export function manualOccurrence(todaySaoPaulo: string): string {
  return `manual:${todaySaoPaulo}`;
}

/** Rótulos fiéis ao provedor: "aceito" ≠ "entregue"; entregue/lido só com callback autêntico da Meta. */
export const DISPATCH_STATUS_LABELS: Record<string, string> = {
  pending: "Na fila", processing: "Enviando", accepted: "Aceito pela Meta", delivered: "Entregue", read: "Lido",
  failed: "Falhou", uncertain: "Incerto (confira no WhatsApp)", skipped: "Ignorado",
};
