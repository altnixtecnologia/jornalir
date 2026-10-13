import "server-only";

export const ASAAS_WEBHOOK_NAME = "JornalIR - Pagamentos";
export const ASAAS_WEBHOOK_EMAIL = "contato@informativoregional.net";
export const ASAAS_WEBHOOK_EVENTS = [
  "PAYMENT_RECEIVED",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
] as const;

function absoluteUrl(hostOrUrl: string): string {
  return /^https?:\/\//i.test(hostOrUrl) ? hostOrUrl : `https://${hostOrUrl}`;
}

export function getAsaasWebhookEndpoint(): string {
  if (process.env.VERCEL_ENV === "production") {
    return "https://controle.altnix.com.br/api/integrations/asaas/webhook";
  }

  const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (previewHost) {
    return `${absoluteUrl(previewHost)}/api/integrations/asaas/webhook`;
  }

  return "http://localhost:3001/api/integrations/asaas/webhook";
}

export function getAsaasWebhookToken(): string | undefined {
  const token = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  return token || undefined;
}
