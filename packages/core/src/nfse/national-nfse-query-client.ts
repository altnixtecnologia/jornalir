import "server-only";
import type { NfseEnvironment } from "@ir/types";
import { fetch, type Dispatcher } from "undici";
import { buildDpsByIdUrl, buildNfseByAccessKeyUrl } from "./national-nfse-provider";
import { NfseIntegrationError, normalizeNfseTransportError } from "./integration-errors";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Item 5, Lote 2, Tarefa 3 — consulta real de DPS/NFS-e via mTLS
 * (GET /dps/{id}, GET /nfse/{chaveAcesso}). As URLs/mTLS/certificado
 * já são as mesmas usadas no resto do módulo (environment.ts,
 * mutual-tls.ts) — a parte NOVA aqui é o tratamento explícito de
 * transporte (timeout, limite de tamanho, ausência/invalidez de
 * resposta), igual ao já usado em municipal-parameters-client.ts.
 *
 * IMPORTANTE (honestidade sobre o que NÃO está confirmado): o formato
 * exato do corpo da resposta (XML puro vs. JSON com XML embutido) não
 * pôde ser confirmado contra a documentação oficial nesta sessão — os
 * manuais encontrados (ADN v1.0 12/02/2026; Emissor Público v1.2
 * out/2025) descrevem as rotas e as regras de sigilo fiscal (a chave
 * da NFS-e só é devolvida se o certificado do solicitante for
 * Prestador/Tomador/Intermediário), mas não detalham o schema exato
 * do corpo — e o host real exige certificado mTLS pra sequer abrir a
 * documentação Swagger sem credencial. Por isso estas funções devolvem
 * o CORPO BRUTO da resposta (string), sem presumir/parsear uma
 * estrutura específica — quem chamar decide o que fazer com o
 * conteúdo, nunca esta função. NUNCA inventa código de rejeição,
 * campo ou regra que não veio de uma fonte oficial confirmada.
 *
 * Nunca chamadas diretamente pelo FetchNationalNfseProvider (ver
 * national-nfse-provider.ts) — esse continua lançando
 * RealTransmissionNotReadyError incondicionalmente, de propósito,
 * enquanto a prontidão completa (certificado real + homologação) não
 * estiver confirmada. Esta é a lógica de transporte PRONTA pra ser
 * ligada quando isso acontecer, já testável com mocks (ver
 * nfse-query.test.ts).
 */
export async function fetchDpsById(
  dispatcher: Dispatcher, dpsId: string, environment: NfseEnvironment, timeoutMs = 15_000,
): Promise<string | null> {
  const url = buildDpsByIdUrl(dpsId, environment);
  const response = await requestRaw(dispatcher, url, timeoutMs);
  if (response === null) return null;
  return response;
}

export async function fetchNfseByAccessKey(
  dispatcher: Dispatcher, accessKey: string, environment: NfseEnvironment, timeoutMs = 15_000,
): Promise<string> {
  const url = buildNfseByAccessKeyUrl(accessKey, environment);
  const body = await requestRaw(dispatcher, url, timeoutMs);
  if (body === null) {
    throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O Sistema Nacional não devolveu o conteúdo da NFS-e para esta chave de acesso.");
  }
  return body;
}

/** 404 devolve null (padrão REST — "não encontrado", nunca um erro); qualquer outro status de erro lança NfseIntegrationError. */
async function requestRaw(dispatcher: Dispatcher, url: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET", headers: { accept: "application/xml, application/json;q=0.9, */*;q=0.1" },
      dispatcher, signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return null;
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O Sistema Nacional retornou uma resposta maior que o limite de segurança.", response.status);
    }
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O Sistema Nacional retornou uma resposta maior que o limite de segurança.", response.status);
    }
    if (!response.ok) {
      throw new NfseIntegrationError("NFSE_HTTP_ERROR", `O Sistema Nacional respondeu com HTTP ${response.status}.`, response.status);
    }
    if (!body.trim()) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "O Sistema Nacional respondeu HTTP 200 sem conteúdo — resposta inesperada.", response.status);
    }
    return body;
  } catch (error) {
    throw normalizeNfseTransportError(error);
  }
}
