import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { fetch, type Dispatcher } from "undici";
import { DOMParser } from "@xmldom/xmldom";
import type { NfseEnvironment } from "@ir/types";
import { assertNfseOperationAllowed, getNfseEnvironmentConfig } from "./environment";
import { NfseIntegrationError, normalizeNfseTransportError } from "./integration-errors";
import { NFSE_MAX_RESPONSE_BYTES, readBoundedNfseBody } from "./bounded-http-body";
import { defaultNfseLogger, type NfseLogger } from "./municipal-parameters-client";
import type { NationalNfseResponseEnvelope } from "./dps-builder";
import { isValidNfseAccessKey } from "./access-key";

const MAX_RESPONSE_BYTES = NFSE_MAX_RESPONSE_BYTES;

export interface NationalEventResponseEnvelope {
  status: "registered" | "rejected";
  eventXml?: string;
  rejection?: { code: string; message: string };
}

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
 * O segmento `/API/` da base URL (reforçado na etapa de integração
 * final, 25/10/2026 — ver comentário completo em `environment.ts`) está
 * agora corroborado por 3 fontes independentes: teste empírico desta
 * sessão, a biblioteca open-source `pynfse-nacional` (lista exatamente
 * `.../API/SefinNacional/docs/index` pro Swagger de homologação e
 * produção) e um post de fórum com uma chamada real a
 * `.../API/SefinNacional/nfse` que recebeu um erro FUNCIONAL de
 * certificado (E4007), não um 404 — só acontece se o path existir e
 * for roteado de verdade. `environment.ts` não precisou mudar.
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
      return this.parseAuthorizedEnvelope(body, signedDpsXml, environment);
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
    const envelope = this.parseJson(body);
    this.assertResponseEnvironment(envelope, environment, "consulta por chave de acesso");
    if (envelope.chaveAcesso !== accessKey || !isValidNfseAccessKey(accessKey)) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "A chave de acesso do retorno da SEFIN não corresponde à chave consultada.");
    }
    const xml = this.decompressNfseField(body);
    this.extractNfseFields(xml);
    return xml;
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
    // DpsGetResponse (SEFIN v1): a resposta oficial é JSON com idDps,
    // chaveAcesso e tipoAmbiente. Mantém corpo bruto para compatibilidade
    // com o contrato interno, mas nunca libera conteúdo de outra DPS.
    const envelope = this.parseJson(body);
    this.assertResponseEnvironment(envelope, environment, "consulta por DPS");
    if (envelope.idDps !== dpsId || !isValidNfseAccessKey(envelope.chaveAcesso as string)) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Retorno de consulta com idDps/chaveAcesso inválidos ou divergentes.");
    }
    return body;
  }

  /**
   * POST /nfse/{chaveAcesso}/eventos — registro de evento (Bloco B,
   * item 2: cancelamento e101101 — ver event-builder.ts). Corpo/campos
   * CORROBORADOS por DUAS fontes independentes (tópicos distintos,
   * autores distintos, mesmo fórum ProjetoACBr — "Cancelamento NFS-e
   * API Nacional" e um tópico posterior sobre o campo de envio):
   * campo de envio `pedidoRegistroEventoXmlGZipB64` (gzip+base64 do
   * `pedRegEvento` assinado no elemento `infPedReg` — NUNCA
   * `dpsXmlGZipB64`, que é o campo de EMISSÃO; um desenvolvedor
   * relatou exatamente esse erro de confusão), campo de retorno
   * `eventoXmlGZipB64`. Mesma ressalva do resto da classe: sem acesso
   * ao Swagger autenticado por mTLS, não há confirmação por manual
   * oficial — revisar antes de qualquer envio real. Nunca chamado fora
   * de `CancellationService`, que continua bloqueado incondicionalmente
   * por `CancellationSubmissionNotReadyError` (cancellation-service.ts).
   */
  async submitCancellationEvent(signedPedRegEventoXml: string, accessKey: string, environment: NfseEnvironment): Promise<NationalEventResponseEnvelope> {
    assertNfseOperationAllowed(environment);
    const config = getNfseEnvironmentConfig(environment);
    const pedidoRegistroEventoXmlGZipB64 = gzipSync(Buffer.from(signedPedRegEventoXml, "utf8")).toString("base64");

    const { status, body } = await this.send("POST", `${config.sefinBaseUrl}/nfse/${encodeURIComponent(accessKey)}/eventos`, environment, "sefin-submit-cancellation-event", {
      method: "POST",
      body: JSON.stringify({ pedidoRegistroEventoXmlGZipB64 }),
    });

    if (status >= 200 && status < 300) return this.parseEventRegisteredEnvelope(body, environment);
    return this.parseEventRejectionEnvelope(body, status);
  }

  /** GET /nfse/{chaveAcesso}/eventos[/{tipoEvento}[/{numSeqEvento}]] —
   * consulta de eventos já registrados para a NFS-e (rota confirmada no
   * Manual dos Contribuintes oficial, ver comentário de
   * `national-nfse-provider.ts`/handoff). Devolve o corpo bruto (pode
   * ser lista de eventos) sem reinterpretar — quem chamar decide o que
   * fazer; nunca usada fora de um fluxo ainda bloqueado. */
  async getEventsByAccessKey(accessKey: string, environment: NfseEnvironment, filter?: { eventType?: string; sequence?: number }): Promise<string> {
    assertNfseOperationAllowed(environment);
    const config = getNfseEnvironmentConfig(environment);
    const segments = [encodeURIComponent(accessKey), "eventos"];
    if (filter?.eventType) segments.push(encodeURIComponent(filter.eventType));
    if (filter?.eventType && filter.sequence !== undefined) segments.push(encodeURIComponent(String(filter.sequence)));
    const { status, body } = await this.send("GET", `${config.sefinBaseUrl}/nfse/${segments.join("/")}`, environment, "sefin-query-events-by-access-key");
    if (status === 404) throw new NfseIntegrationError("NFSE_HTTP_ERROR", "Nenhum evento encontrado para esta chave de acesso.", 404);
    if (status < 200 || status >= 300) throw new NfseIntegrationError("NFSE_HTTP_ERROR", `A SEFIN Nacional respondeu com HTTP ${status} para a consulta de eventos.`, status);
    return body;
  }

  private parseEventRegisteredEnvelope(body: string, environment: NfseEnvironment): NationalEventResponseEnvelope {
    const json = this.parseJson(body);
    this.assertResponseEnvironment(json, environment, "registro de evento");
    const eventoXmlGZipB64 = typeof json.eventoXmlGZipB64 === "string" ? json.eventoXmlGZipB64 : undefined;
    if (!eventoXmlGZipB64) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Resposta de registro de evento sem o campo eventoXmlGZipB64 esperado.");
    }
    const eventXml = this.decompressGzipXml(eventoXmlGZipB64, "eventoXmlGZipB64");
    return { status: "registered", eventXml };
  }

  private parseEventRejectionEnvelope(body: string, status: number): NationalEventResponseEnvelope {
    const { rejection } = this.parseRejectionEnvelope(body, status);
    return { status: "rejected", rejection };
  }

  private parseAuthorizedEnvelope(body: string, signedDpsXml: string, environment: NfseEnvironment): NationalNfseResponseEnvelope {
    const json = this.parseJson(body);
    const submitted = new DOMParser().parseFromString(signedDpsXml, "text/xml");
    const submittedId = submitted.getElementsByTagName("infDPS")[0]?.getAttribute("Id")?.trim();
    if (!submittedId || typeof json.idDps !== "string" || json.idDps !== submittedId) {
      throw new NfseIntegrationError(
        "NFSE_INVALID_RESPONSE",
        "A SEFIN retornou idDps ausente ou diferente da DPS transmitida no envelope de autorização. Resultado incerto.",
      );
    }
    this.assertResponseEnvironment(json, environment, "autorização de NFS-e");
    const nfseXmlGZipB64 = typeof json.nfseXmlGZipB64 === "string" ? json.nfseXmlGZipB64 : undefined;
    if (!nfseXmlGZipB64) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Resposta de autorização sem o campo nfseXmlGZipB64 esperado.");
    }
    const nfseXml = this.decompressGzipXml(nfseXmlGZipB64, "nfseXmlGZipB64");
    const accessKey = this.extractAccessKey(json, nfseXml);
    const { nfseNumber, issuedAt } = this.extractNfseFields(nfseXml);
    // Auditoria estrutural (26/10/2026, item 3 — "validar... associação com prestador/DPS"):
    // a NFS-e autorizada embute o emitente (TCEmitente/CNPJ, sempre antes do <DPS> embutido no
    // mesmo documento, ver tiposComplexos_v1.01.xsd) — confirma que a resposta corresponde ao
    // MESMO prestador da DPS que acabamos de enviar, nunca aceitando uma resposta de outro CNPJ
    // por engano/corrupção. Falha fechada (NFSE_INVALID_RESPONSE, vira "uncertain") se não bater.
    this.assertSamePrestador(signedDpsXml, nfseXml);
    this.assertSameDpsIdentity(signedDpsXml, nfseXml);
    return {
      status: "authorized",
      accessKey,
      nfseNumber,
      issuedAt,
      nfseXml,
    };
  }

  /**
   * O contrato público da SEFIN (NFSePostResponseSucesso, DpsGetResponse,
   * EventosPostResponseSucesso) contém tipoAmbiente inteiro: 1/2.
   * Não aceitar um envelope de outro ambiente, nem ausência do campo.
   */
  private assertResponseEnvironment(
    json: Record<string, unknown>, environment: NfseEnvironment, context: string,
  ): void {
    const expected = environment === "homologation" ? 2 : 1;
    if (json.tipoAmbiente !== expected) {
      throw new NfseIntegrationError(
        "NFSE_INVALID_RESPONSE",
        `Envelope de ${context} com tipoAmbiente ausente ou diferente do ambiente solicitado — resposta não é prova de operação fiscal.`,
      );
    }
  }

  private assertSamePrestador(signedDpsXml: string, nfseXml: string): void {
    const sent = new DOMParser().parseFromString(signedDpsXml, "text/xml");
    const authorized = new DOMParser().parseFromString(nfseXml, "text/xml");
    // Não aceitar o CNPJ do tomador/intermediário como se fosse do prestador:
    // a posição do primeiro <CNPJ> varia conforme o documento.
    const sentPrest = sent.getElementsByTagName("prest")[0];
    const returnedEmit = authorized.getElementsByTagName("emit")[0];
    const sentCnpj = sentPrest?.getElementsByTagName("CNPJ")[0]?.textContent?.trim();
    const returnedCnpj = returnedEmit?.getElementsByTagName("CNPJ")[0]?.textContent?.trim();
    if (!sentCnpj || !returnedCnpj) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Não foi possível confirmar o CNPJ do prestador na DPS enviada ou na NFS-e retornada — associação prestador/DPS não verificável.");
    }
    if (sentCnpj !== returnedCnpj) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "A NFS-e retornada pertence a um CNPJ diferente do prestador que transmitiu a DPS — resposta nunca aceita.");
    }
  }

  /**
   * Conferência indispensável ANTES de persistir uma nota autorizada:
   * o mesmo prestador pode transmitir várias DPS. O vínculo não se prova
   * apenas pelo CNPJ; o Id da DPS embutida e o tpAmb também devem bater.
   */
  private assertSameDpsIdentity(signedDpsXml: string, nfseXml: string): void {
    const sent = new DOMParser().parseFromString(signedDpsXml, "text/xml");
    const authorized = new DOMParser().parseFromString(nfseXml, "text/xml");
    const sentInfDps = sent.getElementsByTagName("infDPS")[0];
    const returnedInfDps = authorized.getElementsByTagName("infDPS")[0];
    const sentId = sentInfDps?.getAttribute("Id")?.trim();
    const returnedId = returnedInfDps?.getAttribute("Id")?.trim();
    if (!sentId || !returnedId || sentId !== returnedId) {
      throw new NfseIntegrationError(
        "NFSE_INVALID_RESPONSE",
        "A NFS-e autorizada não contém a mesma DPS transmitida (infDPS/@Id ausente ou divergente). Resultado incerto: nunca registrar como autorização confirmada.",
      );
    }
    const sentEnvironment = sentInfDps?.getElementsByTagName("tpAmb")[0]?.textContent?.trim();
    const returnedEnvironment = returnedInfDps?.getElementsByTagName("tpAmb")[0]?.textContent?.trim();
    if (!sentEnvironment || !returnedEnvironment || sentEnvironment !== returnedEnvironment) {
      throw new NfseIntegrationError(
        "NFSE_INVALID_RESPONSE",
        "A NFS-e autorizada pertence a ambiente fiscal diferente da DPS transmitida (tpAmb ausente ou divergente).",
      );
    }
  }

  /**
   * Auditoria estrutural (26/10/2026, item 3 — "uma resposta inválida,
   * inesperada ou incompleta da SEFIN nunca pode virar rejeição
   * definitiva"): um HTTP não-2xx SEM corpo JSON interpretável ou SEM
   * nenhum detalhe de erro reconhecível NÃO é prova de que a SEFIN
   * tomou uma decisão fiscal — pode ser um erro de infraestrutura
   * (gateway, 503, proxy devolvendo HTML) que nunca chegou a avaliar a
   * DPS. Antes, este método "inventava" uma rejeição com código
   * "UNKNOWN" nesses casos, que `TransmissionService` tratava como
   * definitiva (rascunho liberado pra edição, como se a SEFIN tivesse
   * de fato rejeitado). Agora LANÇA um erro (`NfseIntegrationError`),
   * que o chamador já trata como "uncertain" (mesmo caminho de
   * timeout/falha de rede) — nunca uma rejeição fiscal fingida. Só
   * retorna `{status:"rejected"}` quando há um detalhe de erro REAL e
   * reconhecível no corpo.
   */
  private parseRejectionEnvelope(body: string, status: number): NationalNfseResponseEnvelope {
    let json: Record<string, unknown>;
    try {
      json = this.parseJson(body);
    } catch {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", `HTTP ${status} sem corpo JSON interpretável — não é uma rejeição fiscal confirmada, resultado incerto.`, status);
    }
    // HTTP 5xx/429/401/403 são falhas de servidor, limitação de taxa
    // ou credencial — nunca uma decisão fiscal definitiva, mesmo se
    // o gateway inserir um array "erros" no JSON.
    if (status >= 500 || status === 429 || status === 401 || status === 403) {
      throw new NfseIntegrationError(
        "NFSE_INVALID_RESPONSE", `HTTP ${status} não confirma rejeição fiscal; o resultado da transmissão permanece incerto.`, status,
      );
    }
    const erros = Array.isArray(json.erros) ? json.erros : [];
    const first = erros[0] as { Codigo?: unknown; Descricao?: unknown; codigo?: unknown; descricao?: unknown } | undefined;
    if (!first) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", `HTTP ${status} sem detalhe de rejeição reconhecível — não é uma rejeição fiscal confirmada, resultado incerto.`, status);
    }
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
    if (direct && isValidNfseAccessKey(direct)) return direct;
    throw new NfseIntegrationError(
      "NFSE_INVALID_RESPONSE",
      direct
        ? "A resposta de autorização trouxe chaveAcesso incompatível com TSChaveNFSe (50 caracteres; inscrição federal alfanumérica permitida). Não persistir nota com chave inválida."
        : "A resposta de autorização não trouxe chaveAcesso — o esquema vendorizado não tem esse campo dentro da própria NFS-e (ver comentário da classe); confirme o contrato real antes de prosseguir.",
    );
  }

  private extractNfseFields(nfseXml: string): { nfseNumber: string; issuedAt: string } {
    // Uma resposta HTTP 2xx não basta para classificar uma NFS-e como
    // AUTORIZADA. Confirmar a situação fiscal do XML (TStat oficial),
    // o número sequencial e a data de processamento antes de persistir.
    if (/<!(?:DOCTYPE|ENTITY)\b/i.test(nfseXml)) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "XML da NFS-e não aceita declarações DTD/ENTITY.");
    }
    const doc = new DOMParser().parseFromString(nfseXml, "text/xml");
    if (doc.documentElement?.localName !== "NFSe" || doc.getElementsByTagName("parsererror").length) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Resposta com raiz XML diferente de NFSe ou XML inválido.");
    }
    const infNFSe = doc.getElementsByTagName("infNFSe")[0];
    if (!infNFSe) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "XML autorizado sem grupo infNFSe.");
    }
    const status = infNFSe.getElementsByTagName("cStat")[0]?.textContent?.trim();
    // Enumerations TStat em tiposSimples_v1.01.xsd (pacote oficial
    // Produção Restrita de 20/10/2026): 100, 102, 103, 107.
    if (!status || !["100", "102", "103", "107"].includes(status)) {
      throw new NfseIntegrationError(
        "NFSE_INVALID_RESPONSE",
        "HTTP 2xx sem cStat de NFS-e gerada permitido pelo XSD oficial: resultado de transmissão incerto.",
      );
    }
    const nNFSe = infNFSe.getElementsByTagName("nNFSe")[0]?.textContent?.trim();
    const dhProc = infNFSe.getElementsByTagName("dhProc")[0]?.textContent?.trim();
    if (!nNFSe || !/^[1-9][0-9]{0,12}$/.test(nNFSe) ||
        !dhProc || !Number.isFinite(Date.parse(dhProc))) {
      throw new NfseIntegrationError(
        "NFSE_INVALID_RESPONSE",
        "XML da NFS-e autorizada sem nNFSe/dhProc válidos conforme o esquema oficial.",
      );
    }
    return { nfseNumber: nNFSe, issuedAt: dhProc };
  }

  private decompressNfseField(body: string): string {
    const json = this.parseJson(body);
    const field = typeof json.nfseXmlGZipB64 === "string" ? json.nfseXmlGZipB64 : undefined;
    if (!field) throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", "Resposta de consulta sem o campo nfseXmlGZipB64 esperado.");
    return this.decompressGzipXml(field, "nfseXmlGZipB64");
  }

  /**
   * Protege o processo contra payloads Base64/GZip adulterados e
   * descompressão expansiva. O limite HTTP de 2 MB não basta:
   * 1 KB comprimido pode expandir para muitos megabytes.
   */
  private decompressGzipXml(encoded: string, fieldName: string): string {
    if (!encoded || encoded.length > MAX_RESPONSE_BYTES ||
        encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", `Campo ${fieldName} não é Base64 válido dentro do limite permitido.`);
    }
    try {
      const xml = gunzipSync(Buffer.from(encoded, "base64"), { maxOutputLength: MAX_RESPONSE_BYTES }).toString("utf8");
      if (!xml.trim()) throw new Error("XML vazio");
      return xml;
    } catch {
      throw new NfseIntegrationError("NFSE_INVALID_RESPONSE", `Campo ${fieldName} não contém XML GZip válido dentro do limite permitido.`);
    }
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
      const body = await readBoundedNfseBody(response);
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
