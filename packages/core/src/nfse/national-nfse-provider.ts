import type { NfseEnvironment } from "@ir/types";
import type { NationalNfseResponseEnvelope } from "./dps-builder";
import { getNfseEnvironmentConfig } from "./environment";
import type { SefinNacionalClient } from "./sefin-nacional-client";

/**
 * Abstração de integração fiscal (Parte 2A, item 3) — nunca acopla a
 * UI/domínio à API HTTP diretamente. Só um provider nesta fase
 * (Emissor Nacional); a interface permite outro no futuro sem
 * generalização prematura.
 */
export interface MunicipalParameters {
  ibgeCode: string;
  /** Payload crus retornado pelo convênio — nunca interpretado como regra fiscal fixa pela aplicação (item 16: "não hardcodar regras fiscais retornadas"). */
  raw: Record<string, unknown>;
  fetchedAt: string;
}

export interface NationalNfseProvider {
  /** GET /parametrizacao/{codigoMunicipio}/convenio */
  getMunicipalParameters(ibgeCode: string, environment: NfseEnvironment): Promise<MunicipalParameters>;
  /** POST /nfse (emissão síncrona) */
  transmitDps(signedDpsXml: string, environment: NfseEnvironment): Promise<NationalNfseResponseEnvelope>;
  /** GET /nfse/{chaveAcesso} */
  getNfseByAccessKey(accessKey: string, environment: NfseEnvironment): Promise<string>;
  /** GET /dps/{id} — também cobre o HEAD /dps/{id} (item 11: checar antes de reemitir). */
  getDpsById(dpsId: string, environment: NfseEnvironment): Promise<string | null>;
}

/**
 * Bases reais (Parte 2B, item "HTTP/mTLS") — centralizadas em
 * `environment.ts` (item 3.2). Confirmadas contra fontes oficiais/
 * corroboração cruzada:
 * - SEFIN Nacional (emissão/consulta de DPS/NFS-e): o Swagger ao vivo
 *   (`https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/`)
 *   exige certificado mTLS pra QUALQUER acesso, inclusive navegar a
 *   documentação — confirmado empiricamente nesta sessão
 *   (`curl`/`WebFetch` retornam 403/renegotiation sem certificado de
 *   cliente, mesmo pedindo só a página de docs). Os paths abaixo vêm
 *   de corroboração cruzada entre duas fontes independentes (Manual de
 *   Conectividade SEFIN; resumos técnicos de integradores) — NUNCA
 *   inventados.
 * - ADN (parâmetros municipais/convênio/alíquota): path confirmado
 *   (item 3.2, corroborado contra múltiplas fontes independentes —
 *   manual oficial de contribuintes da ADN, bibliotecas de integração
 *   de terceiros) como `/parametrizacao/{codigoMunicipio}/convenio` e
 *   `/parametrizacao/{codigoMunicipio}/{codigoServico}/{competencia}/aliquota`,
 *   sob o host ADN (não SEFIN). O prefixo `/parametros_municipais` é
 *   um esquema ANTERIOR (manuais de 2025) e não é mais usado — a versão
 *   anterior deste arquivo misturava os dois prefixos na mesma URL
 *   (bug corrigido aqui).
 *
 * Nosso valor interno "homologation" corresponde, nesta fase, ao
 * ambiente real de PRODUÇÃO RESTRITA (RTC) — não existe uma distinção
 * de "homologação verdadeira" separada sendo usada aqui; produção real
 * nunca é chamada (ver isTransmissionEnvironmentAllowed em @ir/types).
 */
export function buildMunicipalParametersUrl(ibgeCode: string, environment: NfseEnvironment): string {
  return `${getNfseEnvironmentConfig(environment).municipalParametersBaseUrl}/${ibgeCode}/convenio`;
}
export function buildTransmitDpsUrl(environment: NfseEnvironment): string {
  return `${getNfseEnvironmentConfig(environment).sefinBaseUrl}/nfse`;
}
export function buildNfseByAccessKeyUrl(accessKey: string, environment: NfseEnvironment): string {
  return `${getNfseEnvironmentConfig(environment).sefinBaseUrl}/nfse/${accessKey}`;
}
export function buildDpsByIdUrl(dpsId: string, environment: NfseEnvironment): string {
  return `${getNfseEnvironmentConfig(environment).sefinBaseUrl}/dps/${dpsId}`;
}

/**
 * Transmissão real bloqueada (ajuste de segurança, item 7 da Parte 2A
 * e item "Transmissão continua bloqueada" da Parte 2B) — nenhuma
 * chamada à API Nacional pode ocorrer enquanto a guarda central de
 * prontidão (ver readiness.ts, `isReadyForHomologationTransmission`)
 * não estiver 100% satisfeita. As URLs/paths já estão corretos e
 * testáveis (ver `build*Url` acima) — só a chamada de rede em si
 * permanece desligada nesta fase.
 */
export class RealTransmissionNotReadyError extends Error {
  constructor() {
    super(
      "Transmissão real bloqueada: a guarda central de prontidão (certificado/assinatura/XSD/série/parâmetros fiscais) ainda não está satisfeita. Nenhuma chamada à API Nacional pode ocorrer enquanto isso não for resolvido.",
    );
  }
}

/**
 * Implementação real via `fetch` (Node/undici) — URLs/paths reais já
 * definidos (ver `build*Url` acima, nunca endpoint inventado), mas
 * TODO método lança `RealTransmissionNotReadyError` ANTES de chamar
 * `fetch`, de propósito (ver guarda acima). Suporte a mTLS: o
 * `mutualTlsAgent` (criado por `createMutualTlsDispatcher` em
 * `mutual-tls.ts`, server-only) é repassado como `dispatcher` pro
 * `fetch` nativo do Node (opção não padronizada, suportada porque o
 * `fetch` global do Node é implementado sobre `undici`) — só a
 * conexão TLS do cliente; nunca a chave privada chega à aplicação de
 * outra forma.
 *
 * (Bloco B, 25/10/2026) O CLIENTE REAL que construiria/interpretaria
 * cada requisição JÁ EXISTE e está testado de forma independente:
 * `SefinNacionalClient` (sefin-nacional-client.ts) — gzip+base64 do
 * corpo, parsing das respostas de autorização/rejeição, consultas por
 * chave/DPS, tudo corroborado por múltiplas fontes externas (ver
 * comentário da classe). Esta classe NUNCA o instancia/chama de
 * propósito: a guarda abaixo continua a única forma de "transmissão
 * real bloqueada", sem depender de o cliente real existir ou não —
 * religar significa trocar o corpo de cada método abaixo para delegar
 * ao `SefinNacionalClient`, nunca remover esta classe nem o
 * `RealTransmissionNotReadyError`.
 */
export class FetchNationalNfseProvider implements NationalNfseProvider {
  constructor(private readonly mutualTlsAgent?: unknown) {}

  async getMunicipalParameters(ibgeCode: string, environment: NfseEnvironment): Promise<MunicipalParameters> {
    void buildMunicipalParametersUrl(ibgeCode, environment);
    void this.mutualTlsAgent;
    throw new RealTransmissionNotReadyError();
  }

  async transmitDps(signedDpsXml: string, environment: NfseEnvironment): Promise<NationalNfseResponseEnvelope> {
    void buildTransmitDpsUrl(environment);
    void signedDpsXml;
    throw new RealTransmissionNotReadyError();
  }

  async getNfseByAccessKey(accessKey: string, environment: NfseEnvironment): Promise<string> {
    void buildNfseByAccessKeyUrl(accessKey, environment);
    throw new RealTransmissionNotReadyError();
  }

  async getDpsById(dpsId: string, environment: NfseEnvironment): Promise<string | null> {
    void buildDpsByIdUrl(dpsId, environment);
    throw new RealTransmissionNotReadyError();
  }
}

/**
 * Adaptador REAL (etapa de integração final, 25/10/2026, item 3 — "conectar
 * o SefinNacionalClient ao TransmissionService... por meio de interfaces
 * testáveis") — delega cada método do `NationalNfseProvider` diretamente ao
 * `SefinNacionalClient` (sefin-nacional-client.ts), sem guarda nenhuma.
 *
 * Prova que a integração ponta a ponta FUNCIONA de verdade: qualquer teste
 * pode montar um `TransmissionService` com esta classe (em vez de
 * `FetchNationalNfseProvider`) e um `SefinNacionalClient` sobre `MockAgent`,
 * e exercitar o fluxo completo rascunho → DPS → assinatura → transmissão →
 * interpretação → nota emitida/rejeitada/incerta (ver
 * `nfse-end-to-end-real-client.test.ts`).
 *
 * NUNCA é instanciada pela composição real do app
 * (`apps/sistema/src/composition/nfse.ts` continua usando só
 * `FetchNationalNfseProvider`, que bloqueia incondicionalmente) — esta
 * classe existe apenas pra provar/testar que a integração está pronta,
 * nunca pra contornar o bloqueio em produção. `getMunicipalParameters`
 * continua bloqueado de propósito: nenhum caminho real chama esse método
 * do `NationalNfseProvider` (a consulta de parâmetros municipais usa
 * `NfseMunicipalParametersClient` diretamente, já real e já testado — ver
 * `municipal-parameters-client.ts`), então não há o que conectar aqui sem
 * inventar um uso que não existe.
 */
export class SefinNacionalNationalNfseProvider implements NationalNfseProvider {
  constructor(private readonly client: SefinNacionalClient) {}

  async getMunicipalParameters(ibgeCode: string, environment: NfseEnvironment): Promise<MunicipalParameters> {
    void buildMunicipalParametersUrl(ibgeCode, environment);
    throw new RealTransmissionNotReadyError();
  }

  transmitDps(signedDpsXml: string, environment: NfseEnvironment): Promise<NationalNfseResponseEnvelope> {
    return this.client.transmitDps(signedDpsXml, environment);
  }

  getNfseByAccessKey(accessKey: string, environment: NfseEnvironment): Promise<string> {
    return this.client.getNfseByAccessKey(accessKey, environment);
  }

  getDpsById(dpsId: string, environment: NfseEnvironment): Promise<string | null> {
    return this.client.getDpsById(dpsId, environment);
  }
}
