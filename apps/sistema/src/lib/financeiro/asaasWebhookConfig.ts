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
  // O ambiente do Asaas manda mais que o tipo do deployment da Vercel.
  // Hoje controle.altnix.com.br pode apontar temporariamente para um build
  // Preview, mas cobranças reais precisam sempre usar o endpoint estável.
  if ((process.env.ASAAS_ENV ?? "").trim().toLowerCase() === "production") {
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
