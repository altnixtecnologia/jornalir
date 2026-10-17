import "server-only";
import type { NfseEnvironment, NfseMunicipalParametersResult } from "@ir/types";
import { fetch, type Dispatcher } from "undici";
import { assertNfseOperationAllowed, getNfseEnvironmentConfig } from "./environment";
import { NfseIntegrationError, normalizeNfseTransportError } from "./integration-errors";

const MAX_RESPONSE_BYTES = 1024 * 1024;

export interface NfseRequestLog {
  operation: string;
  environment: NfseEnvironment;
  logicalEndpoint: string;
  status?: number;
  durationMs: number;
  errorCode?: string;
  message: string;
}

export type NfseLogger = (entry: NfseRequestLog) => void;

const defaultLogger: NfseLogger = (entry) => {
  const method = entry.errorCode ? console.warn : console.info;
  method("[nfse]", entry);
};

function validateIbgeCode(value: string): void {
  if (!/^\d{7}$/.test(value)) throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Código IBGE inválido para a consulta municipal.");
}

function validateServiceCode(value: string): void {
  if (!/^\d{6}$/.test(value)) throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Código de tributação nacional inválido para a consulta.");
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O ADN retornou uma resposta JSON em formato inesperado.");
  }
  return value as Record<string, unknown>;
}

/**
 * Consulta de parâmetros municipais (convênio + alíquota) no ADN
 * (Parte 2C/item 3.2) — leitura pública, NUNCA grava/emite nada.
 * Timeout, limite de tamanho de resposta e normalização de erro
 * (mTLS/timeout/HTTP) seguem o mesmo princípio de mutual-tls.ts/
 * integration-errors.ts. O resultado devolve o payload do ADN como
 * veio — nunca reinterpretado como alíquota/regra fixa pela aplicação
 * (os dados são do serviço oficial, não definidos por este sistema).
 */
export class NfseMunicipalParametersClient {
  constructor(
    private readonly dispatcher: Dispatcher,
    private readonly timeoutMs = 15_000,
    private readonly logger: NfseLogger = defaultLogger,
  ) {}

  async queryMunicipalityAndService(input: {
    municipalityCode: string;
    serviceCode: string;
    competence: string;
    environment?: NfseEnvironment;
  }): Promise<NfseMunicipalParametersResult> {
    const environment = input.environment ?? "homologation";
    assertNfseOperationAllowed(environment);
    validateIbgeCode(input.municipalityCode);
    validateServiceCode(input.serviceCode);

    const config = getNfseEnvironmentConfig(environment);
    const municipality = encodeURIComponent(input.municipalityCode);
    const service = encodeURIComponent(input.serviceCode);
    const competence = encodeURIComponent(input.competence);
    const [agreement, serviceParameters] = await Promise.all([
      this.getJson(`${config.municipalParametersBaseUrl}/${municipality}/convenio`, environment, "municipal-agreement"),
      this.getJson(`${config.municipalParametersBaseUrl}/${municipality}/${service}/${competence}/aliquota`, environment, "municipal-service-rate"),
    ]);

    return {
      environment: "restricted",
      municipalityCode: input.municipalityCode,
      serviceCode: input.serviceCode,
      competence: input.competence,
      fetchedAt: new Date().toISOString(),
      agreement,
      serviceParameters,
    };
  }

  private async getJson(url: string, environment: NfseEnvironment, logicalEndpoint: string): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    let status: number | undefined;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = response.status;
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_RESPONSE_BYTES) {
        throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O ADN retornou uma resposta maior que o limite de segurança.", status);
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O ADN retornou uma resposta maior que o limite de segurança.", status);
      }
      if (!response.ok) {
        throw new NfseIntegrationError("NFSE_HTTP_ERROR", `O ADN respondeu com HTTP ${response.status}.`, response.status);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O ADN retornou conteúdo que não é JSON válido.", status);
      }
      const result = asObject(parsed);
      this.logger({ operation: "GET", environment, logicalEndpoint, status, durationMs: Date.now() - startedAt, message: "Consulta concluída." });
      return result;
    } catch (error) {
      const normalized = normalizeNfseTransportError(error);
      this.logger({
        operation: "GET",
        environment,
        logicalEndpoint,
        status: normalized.httpStatus ?? status,
        durationMs: Date.now() - startedAt,
        errorCode: normalized.code,
        message: normalized.message,
      });
      throw normalized;
    }
  }
}
