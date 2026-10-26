import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { fetch, type Dispatcher } from "undici";
import { DOMParser } from "@xmldom/xmldom";
import type { NfseEnvironment } from "@ir/types";
import { assertNfseOperationAllowed, getNfseEnvironmentConfig } from "./environment";
import { NfseIntegrationError, normalizeNfseTransportError } from "./integration-errors";
import { defaultNfseLogger, type NfseLogger } from "./municipal-parameters-client";
import type { NationalNfseResponseEnvelope } from "./dps-builder";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Cliente REAL da SEFIN Nacional (Bloco B) — contrato REST corroborado
 * por MÚLTIPLAS fontes independentes, já que o Swagger ao vivo exige
 * mTLS pra qualquer acesso (confirmado empiricamente, ver
 * national-nfse-provider.ts): o Manual dos Contribuintes oficial
 * (gov.br/nfse, v1.0 17/03/2025) confirma os MÉTODOS
 * (POST /nfse, GET /nfse/{chaveAcesso}, GET+HEAD /dps/{id}) e a
 * semântica de cada um; o formato de BYTES do corpo (gzip+base64) e os
 * nomes de campo JSON (`dpsXmlGZipB64`, `nfseXmlGZipB64`,
 * `erros:[{Codigo,Descricao}]`) vêm de três fontes independentes que
 * convergem: um post de fórum (ProjetoACBr) com uma resposta REAL
 * colada (`"Codigo":"E999","Descricao":"Erro não catalogado"`), um
 * blog técnico (Nota Gateway: "o XML... precisa ser compactado via
 * GZip, codificado em Base64") e uma issue de um projeto open-source
 * (nfse-emissor-go) corrigindo exatamente esse campo.
 *
 * LIMITAÇÃO HONESTA (não inventada, não escondida): o XSD oficial
 * vendorizado (tiposComplexos_v1.01.xsd, `TCInfNFSe`) NÃO tem nenhum
 * elemento "chave de acesso" dentro da própria NFS-e — só o atributo
 * `Id` (tipo `TSIdNFSe`, 53 chars, prefixo "NFS", estrutura DIFERENTE
 * do padrão de 50 chars de `TSChaveNFSe`). Isso é consistente com a
 * chave de acesso sendo um campo retornado pela API ao lado de
 * `nfseXmlGZipB64` no JSON (não inventado), mas isso NÃO foi
 * confirmado contra uma resposta real — nenhuma fonte disponível
 * mostrou o JSON de sucesso completo. `extractAccessKey()` abaixo
 * tenta o campo top-level `chaveAcesso`; se ausente, FALHA FECHADO com
 * erro explícito em vez de adivinhar — nunca deriva um valor errado do
 * `Id` sem confirmação. Precisa reconfirmação contra o Swagger real
 * (ou uma resposta real de Produção Restrita) antes de qualquer uso.
 *
 * Também não confirmado: a base URL exata inclui ou não o segmento
 * `/API/` (o comentário em national-nfse-provider.ts cita
 * `.../API/SefinNacional/` como testado empiricamente; um post de
 * fórum de 2026 usou `.../SefinNacional/nfse` sem `/API/` e recebeu
 * E999 — pode ser a causa do próprio erro do autor, não prova de URL
 * correta). `environment.ts` NÃO foi alterado por este motivo — a
 * configuração de URL já existente e documentada foi preservada.
 */
export class SefinNacionalClient {
  constructor(
    private readonly dispatcher: Dispatcher,
    private readonly timeoutMs = 20_000,
    private readonly logger: NfseLogger = defaultNfseLogger,
  ) {}

  /** POST /nfse — emissão síncrona. Nunca usada fora de um `FetchNationalNfseProvider`
   * ainda bloqueado por `RealTransmissionNotReadyError` (ver national-nfse-provider.ts);
   * esta classe é o cliente REAL, mas quem decide SE ela é chamada é o provider. */
  async transmitDps(signedDpsXml: string, environment: NfseEnvironment): Promise<NationalNfseResponseEnvelope> {
    assertNfseOperationAllowed(environment);
    const config = getNfseEnvironmentConfig(environment);
    const dpsXmlGZipB64 = gzipSync(Buffer.from(signedDpsXml, "utf8")).toString("base64");

    const { status, body } = await this.send("POST", `${config.sefinBaseUrl}/nfse`, environment, "sefin-transmit-dps", {
      method: "POST",
      body: JSON.stringify({ dpsXmlGZipB64 }),
    });

    if (status >= 200 && status < 300) {
      return this.parseAuthorizedEnvelope(body);
    }
    return this.parseRejectionEnvelope(body, status);
  }

  /** GET /nfse/{chaveAcesso} — consulta pela chave de acesso. */
  async getNfseByAccessKey(accessKey: string, environment: NfseEnvironment): Promise<string> {
    assertNfseOperationAllowed(environment);
    const config = getNfseEnvironmentConfig(environment);
    const { status, body } = await this.send("GET", `${config.sefinBaseUrl}/nfse/${encodeURIComponent(accessKey)}`, environment, "sefin-query-by-access-key");
    if (status === 404) throw new NfseIntegrationError("NFSE_HTTP_ERROR", "NFS-e não encontrada para esta chave de acesso.", 404);
    if (status < 200 || status >= 300) throw new NfseIntegrationError("NFSE_HTTP_ERROR", `A SEFIN Nacional respondeu com HTTP ${status} para a consulta por chave de acesso.`, status);
    return this.decompressNfseField(body);
  }

  /** GET /dps/{id} — recupera a chave de acesso a partir do identificador da DPS
   * (só liberado para os atores da DPS, ver manual oficial). 404/sem permissão -> null.
   * LIMITAÇÃO HONESTA: o manual oficial descreve a SEMÂNTICA ("retorna a chave de
   * acesso da NFS-e correspondente") mas não o FORMATO exato do corpo (JSON com
   * `chaveAcesso`? texto puro?) — nenhuma fonte disponível confirmou. Devolve o
   * corpo bruto como veio, sem reinterpretar; quem chamar decide o que fazer, e
   * isto precisa reconfirmação contra uma resposta real antes de qualquer uso. */
  async getDpsById(dpsId: string, environment: NfseEnvironment): Promise<string | null> {
    assertNfseOperationAllowed(environment);
    const config = getNfseEnvironmentConfig(environment);
    const { status, body } = await this.send("GET", `${config.sefinBaseUrl}/dps/${encodeURIComponent(dpsId)}`, environment, "sefin-query-dps-by-id");
    if (status === 404 || status === 403) return null;
    if (status < 200 || status >= 300) throw new NfseIntegrationError("NFSE_HTTP_ERROR", `A SEFIN Nacional respondeu com HTTP ${status} para a consulta de DPS.`, status);
    return body;
  }

  private parseAuthorizedEnvelope(body: string): NationalNfseResponseEnvelope {
    const json = this.parseJson(body);
    const nfseXmlGZipB64 = typeof json.nfseXmlGZipB64 === "string" ? json.nfseXmlGZipB64 : undefined;
    if (!nfseXmlGZipB64) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Resposta de autorização sem o campo nfseXmlGZipB64 esperado.");
    }
    const nfseXml = gunzipSync(Buffer.from(nfseXmlGZipB64, "base64")).toString("utf8");
    const accessKey = this.extractAccessKey(json, nfseXml);
    const { nfseNumber, issuedAt } = this.extractNfseFields(nfseXml);
    return {
      status: "authorized",
      accessKey,
      nfseNumber,
      issuedAt,
      nfseXml,
    };
  }

  private parseRejectionEnvelope(body: string, status: number): NationalNfseResponseEnvelope {
    let json: Record<string, unknown>;
    try {
      json = this.parseJson(body);
    } catch {
      return { status: "rejected", rejection: { code: "UNKNOWN", message: `HTTP ${status} sem corpo JSON interpretável.` } };
    }
    const erros = Array.isArray(json.erros) ? json.erros : [];
    const first = erros[0] as { Codigo?: unknown; Descricao?: unknown; codigo?: unknown; descricao?: unknown } | undefined;
    if (!first) return { status: "rejected", rejection: { code: "UNKNOWN", message: `HTTP ${status} sem detalhe de rejeição.` } };
    // Duas fontes independentes convergiram em capitalizações diferentes
    // (Codigo/Descricao vs codigo/descricao) — aceita ambas, nunca assume.
    const code = String(first.Codigo ?? first.codigo ?? "UNKNOWN");
    const message = String(first.Descricao ?? first.descricao ?? "Rejeitada sem descrição.");
    return { status: "rejected", rejection: { code, message } };
  }

  /** `chaveAcesso` SÓ é aceito se vier explicitamente na resposta — nunca
   * derivado do `Id` da NFS-e (formatos incompatíveis, ver nota da classe). */
  private extractAccessKey(json: Record<string, unknown>, _nfseXml: string): string {
    const direct = typeof json.chaveAcesso === "string" ? json.chaveAcesso : undefined;
    if (direct) return direct;
    throw new NfseIntegrationError(
      "NFSE_INVALID_RESPONSE",
      "A resposta de autorização não trouxe chaveAcesso — o esquema vendorizado não tem esse campo dentro da própria NFS-e (ver comentário da classe); confirme o contrato real antes de prosseguir.",
    );
  }

  private extractNfseFields(nfseXml: string): { nfseNumber: string; issuedAt: string } {
    const doc = new DOMParser().parseFromString(nfseXml, "text/xml");
    const nNFSe = doc.getElementsByTagName("nNFSe")[0]?.textContent?.trim();
    const dhProc = doc.getElementsByTagName("dhProc")[0]?.textContent?.trim();
    if (!nNFSe || !dhProc) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "XML da NFS-e autorizada sem nNFSe/dhProc — não corresponde ao esquema oficial esperado.");
    }
    return { nfseNumber: nNFSe, issuedAt: dhProc };
  }

  private decompressNfseField(body: string): string {
    const json = this.parseJson(body);
    const field = typeof json.nfseXmlGZipB64 === "string" ? json.nfseXmlGZipB64 : undefined;
    if (!field) throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Resposta de consulta sem o campo nfseXmlGZipB64 esperado.");
    return gunzipSync(Buffer.from(field, "base64")).toString("utf8");
  }

  private parseJson(body: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "A SEFIN Nacional retornou conteúdo que não é JSON válido.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "A SEFIN Nacional retornou um JSON em formato inesperado.");
    }
    return parsed as Record<string, unknown>;
  }

  private async send(
    method: "GET" | "POST",
    url: string,
    environment: NfseEnvironment,
    logicalEndpoint: string,
    extra?: { method: "POST"; body: string },
  ): Promise<{ status: number; body: string }> {
    const startedAt = Date.now();
    let status: number | undefined;
    try {
      const response = await fetch(url, {
        method,
        headers: { accept: "application/json", ...(extra ? { "content-type": "application/json" } : {}) },
        body: extra?.body,
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = response.status;
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_RESPONSE_BYTES) {
        throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "A SEFIN Nacional retornou uma resposta maior que o limite de segurança.", status);
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "A SEFIN Nacional retornou uma resposta maior que o limite de segurança.", status);
      }
      this.logger({ operation: method, environment, logicalEndpoint, status, durationMs: Date.now() - startedAt, message: "Requisição concluída." });
      return { status, body };
    } catch (error) {
      const normalized = normalizeNfseTransportError(error);
      this.logger({
        operation: method,
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
