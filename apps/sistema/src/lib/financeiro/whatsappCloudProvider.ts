import "server-only";

export interface WhatsappBillingTemplateInput {
  toPhone: string;
  clientName: string;
  reference: string;
  amountLabel: string;
  dueDateLabel: string;
  paymentUrl: string;
}

export interface WhatsappBillingTemplateResult {
  providerMessageId?: string;
}

function token(): string | undefined {
  return (process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_TOKEN ?? "").trim() || undefined;
}

function phoneNumberId(): string | undefined {
  return (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim() || undefined;
}

export function isWhatsappCloudConfigured(): boolean {
  return Boolean(token() && phoneNumberId());
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

async function sendTemplate(
  toPhone: string,
  template: string,
  variables: string[],
): Promise<WhatsappBillingTemplateResult> {
  const accessToken = token();
  const numberId = phoneNumberId();
  if (!accessToken || !numberId) throw new Error("WhatsApp Cloud API não configurada.");

  const version = (process.env.WHATSAPP_API_VERSION ?? "v21.0").trim();
  const language = (process.env.WHATSAPP_BILLING_LANGUAGE ?? "pt_BR").trim();
  const to = normalizePhone(toPhone);
  if (!to) throw new Error("Cliente sem WhatsApp válido.");

  const response = await fetch("https://graph.facebook.com/" + version + "/" + numberId + "/messages", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: language },
        components: variables.length
          ? [
              {
                type: "body",
                parameters: variables.map((text) => ({ type: "text", text })),
              },
            ]
          : undefined,
      },
    }),
  });

  const raw = await response.text();
  let body: Record<string, any> = {};
  if (raw) {
    try {
      body = JSON.parse(raw) as Record<string, any>;
    } catch {
      body = { message: raw.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const meta = body?.error as { code?: number; message?: string; title?: string } | undefined;
    const detail = meta?.message || meta?.title || body?.message || "erro desconhecido";
    throw new Error(
      "WhatsApp/Meta retornou " +
        response.status +
        (meta?.code ? " (Meta " + meta.code + ")" : "") +
        ": " +
        detail,
    );
  }

  const providerMessageId = body?.messages?.[0]?.id;
  if (typeof providerMessageId !== "string" || !providerMessageId.trim()) {
    throw new Error("A Meta não confirmou um identificador de mensagem. Verifique o envio no WhatsApp Manager antes de tentar novamente.");
  }
  return { providerMessageId };
}

export async function sendWhatsappBillingTemplate(
  input: WhatsappBillingTemplateInput,
): Promise<WhatsappBillingTemplateResult> {
  const template = (process.env.WHATSAPP_BILLING_TEMPLATE ?? "fatura_disponivel").trim();
  return sendTemplate(input.toPhone, template, [
    input.clientName,
    input.reference,
    input.amountLabel,
    input.dueDateLabel,
    input.paymentUrl,
  ]);
}

export async function sendWhatsappPaymentConfirmedTemplate(input: {
  toPhone: string;
  clientName: string;
  reference: string;
  amountLabel: string;
  paymentMethodLabel: string;
  transactionId: string;
}): Promise<WhatsappBillingTemplateResult> {
  // Template criado na Meta em 13/10/2026.
  // Variáveis, na ordem aprovada:
  // {{1}} nome; {{2}} referência; {{3}} valor; {{4}} forma; {{5}} transação.
  const template = (process.env.WHATSAPP_PAYMENT_CONFIRMED_TEMPLATE ?? "confirmacao_pagamento_ir").trim();
  return sendTemplate(input.toPhone, template, [
    input.clientName,
    input.reference,
    input.amountLabel,
    input.paymentMethodLabel,
    input.transactionId,
  ]);
}

/** Template separado, que deve ser aprovado pela Meta antes de habilitar. */
export function isWhatsappSignatureTemplateConfigured(): boolean {
  return isWhatsappCloudConfigured() && Boolean(process.env.WHATSAPP_SIGNATURE_INVITE_TEMPLATE?.trim());
}

export async function sendWhatsappSignatureInviteTemplate(input: {
  toPhone: string;
  signerName: string;
  contractNumber: string;
  invitationLink: string;
}): Promise<WhatsappBillingTemplateResult> {
  const template = (process.env.WHATSAPP_SIGNATURE_INVITE_TEMPLATE ?? "").trim();
  if (!template) throw new Error("Configure primeiro um template de convite de assinatura aprovado na Meta.");
  // Template pt_BR aprovado deve conter, na ordem:
  // {{1}} nome do signatário; {{2}} contrato; {{3}} link privado.
  return sendTemplate(input.toPhone, template, [
    input.signerName,
    input.contractNumber,
    input.invitationLink,
  ]);
}
