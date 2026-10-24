import "server-only";

import {canUseAsaasProductionApi} from "./asaasRuntimePolicy";

export type AsaasEnvironment = "sandbox" | "production";

export function getConfiguredAsaasEnvironment(): AsaasEnvironment | undefined {
  const value = (process.env.ASAAS_ENV ?? "").trim().toLowerCase();
  if (value === "sandbox") return "sandbox";
  if (value === "production" || value === "prod") return "production";
  return undefined;
}

/**
 * Aceita dois formatos de configuração:
 * 1) ASAAS_API_KEY_SANDBOX / ASAAS_API_KEY_PRODUCTION (JornalIR);
 * 2) ASAAS_API_KEY + ASAAS_ENV (compatibilidade com o Altnix Informativo).
 *
 * A chave legada só é usada quando ASAAS_ENV identifica explicitamente
 * o mesmo ambiente solicitado — nunca presume produção/sandbox.
 */
export function getAsaasApiKey(environment: AsaasEnvironment): string | undefined {
  // Mesmo que a chave LIVE esteja configurada em Preview, ela NUNCA
  // poderá autenticar chamadas à API real. Sem fallback silencioso.
  if(environment==="production"&&!canUseAsaasProductionApi({
    vercelEnv:process.env.VERCEL_ENV,nodeEnv:process.env.NODE_ENV,
  }))return undefined;
  const specific =
    environment === "sandbox"
      ? process.env.ASAAS_API_KEY_SANDBOX
      : process.env.ASAAS_API_KEY_PRODUCTION;

  if (specific?.trim()) return specific.trim();

  const legacyKey = process.env.ASAAS_API_KEY?.trim();
  if (!legacyKey) return undefined;
  return getConfiguredAsaasEnvironment() === environment ? legacyKey : undefined;
}

export function isAsaasApiKeyConfigured(environment: AsaasEnvironment): boolean {
  return Boolean(getAsaasApiKey(environment));
}
