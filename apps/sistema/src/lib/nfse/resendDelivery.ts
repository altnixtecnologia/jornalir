import "server-only";
import { fiscalRecipient } from "./deliveryPolicy";

export class EmailOutcomeUncertainError extends Error {}
export class EmailRejectedByProviderError extends Error {}

export interface FiscalEmailAttachment {
  filename: string;
  contentType: "application/pdf" | "application/xml";
  bytes: Buffer;
}
export interface FiscalEmailInput {
  attemptId: string;
  to: string;
  noteNumber: string;
  attachments: FiscalEmailAttachment[];
}
export function isNfseEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NFSE_EMAIL_FROM);
}

/** Resend API: idempotency key por tentativa e anexos, sem links publicos. */
export async function sendFiscalEmail(input: FiscalEmailInput): Promise<{ providerMessageId: string }> {
  if (!isNfseEmailConfigured()) throw new EmailRejectedByProviderError("Serviço de e-mail fiscal não configurado.");
  if (!fiscalRecipient({ email: input.to })) throw new EmailRejectedByProviderError("Destinatário fiscal inválido.");
  if (!input.attachments.some((a) => a.contentType === "application/pdf") ||
      !input.attachments.some((a) => a.contentType === "application/xml")) {
    throw new EmailRejectedByProviderError("PDF e XML originais são obrigatórios para envio da NFS-e.");
  }
  const from = process.env.NFSE_EMAIL_FROM!;
  const number = input.noteNumber.replace(/[\r\n]/g, " ").slice(0, 80);
  const payload = {
    from, to: [input.to],
    subject: `NFS-e nº ${number} — Jornal Informativo Regional`,
    text: `Segue sua Nota Fiscal de Serviços Eletrônica nº ${number}. Anexamos o DANFSe (PDF) e a NFS-e original (XML). Caso necessite de auxílio, entre em contato com o Jornal Informativo Regional.`,
    attachments: input.attachments.map((a) => ({
      filename: a.filename,
      content: a.bytes.toString("base64"),
      content_type: a.contentType,
    })),
  };
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `nfse-email-${input.attemptId}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch {
    // Timeout pode ocorrer DEPOIS de o provedor aceitar.
    throw new EmailOutcomeUncertainError("Conexão com provedor inconclusiva. Verifique antes de reenviar.");
  }
  if (!response.ok) {
    // 4xx validado é rejeição; 5xx/429 podem ser ambíguos e exigem verificação.
    if (response.status === 429 || response.status >= 500 || response.status === 409) {
      throw new EmailOutcomeUncertainError(`Provedor retornou HTTP ${response.status}; verificar tentativa.`);
    }
    throw new EmailRejectedByProviderError(`Provedor recusou envio (HTTP ${response.status}).`);
  }
  let result: { id?: unknown };
  try { result = await response.json() as { id?: unknown }; }
  catch { throw new EmailOutcomeUncertainError("Provedor aceitou requisição sem identificação legível."); }
  if (typeof result.id !== "string" || !result.id) {
    throw new EmailOutcomeUncertainError("Retorno sem identificação do e-mail; consultar provedor.");
  }
  return { providerMessageId: result.id };
}
