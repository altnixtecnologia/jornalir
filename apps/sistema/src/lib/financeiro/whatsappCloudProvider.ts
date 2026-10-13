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

export async function sendWhatsappBillingTemplate(
  input: WhatsappBillingTemplateInput,
): Promise<WhatsappBillingTemplateResult> {
  const accessToken = token();
  const numberId = phoneNumberId();
  if (!accessToken || !numberId) throw new Error("WhatsApp Cloud API não configurada.");

  const version = (process.env.WHATSAPP_API_VERSION ?? "v21.0").trim();
  const template = (process.env.WHATSAPP_BILLING_TEMPLATE ?? "fatura_disponivel").trim();
  const language = (process.env.WHATSAPP_BILLING_LANGUAGE ?? "pt_BR").trim();
  const to = normalizePhone(input.toPhone);
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
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: input.clientName },
              { type: "text", text: input.reference },
              { type: "text", text: input.amountLabel },
              { type: "text", text: input.dueDateLabel },
              { type: "text", text: input.paymentUrl },
            ],
          },
        ],
      },
    }),
  });

  const raw = await response.text();
  let body: Record<string, any> = {};
  if (raw) {
    try { body = JSON.parse(raw) as Record<string, any>; } catch { body = { message: raw.slice(0, 500) }; }
  }
  if (!response.ok) {
    const meta = body?.error as { code?: number; message?: string; title?: string } | undefined;
    const detail = meta?.message || meta?.title || body?.message || "erro desconhecido";
    throw new Error("WhatsApp/Meta retornou " + response.status + (meta?.code ? " (Meta " + meta.code + ")" : "") + ": " + detail);
  }

  return { providerMessageId: body?.messages?.[0]?.id as string | undefined };
}
