import type { NfseEnvironment } from "@ir/types";
import type { NationalNfseResponseEnvelope } from "./dps-builder";

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
  /** GET /parametros_municipais/{codigoMunicipio}/convenio */
  getMunicipalParameters(ibgeCode: string, environment: NfseEnvironment): Promise<MunicipalParameters>;
  /** POST /nfse (emissão síncrona) */
  transmitDps(signedDpsXml: string, environment: NfseEnvironment): Promise<NationalNfseResponseEnvelope>;
  /** GET /nfse/{chaveAcesso} */
  getNfseByAccessKey(accessKey: string, environment: NfseEnvironment): Promise<string>;
  /** GET /dps/{id} — também cobre o HEAD /dps/{id} (item 11: checar antes de reemitir). */
  getDpsById(dpsId: string, environment: NfseEnvironment): Promise<string | null>;
}

/**
 * Bases reais (Parte 2B, item "HTTP/mTLS") — confirmadas contra fontes
 * oficiais/corroboração cruzada (item 6 do prompt desta fase):
 * - SEFIN Nacional (emissão/consulta de DPS/NFS-e): o Swagger ao vivo
 *   (`https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/`)
 *   exige certificado mTLS pra QUALQUER acesso, inclusive navegar a
 *   documentação — confirmado empiricamente nesta sessão
 *   (`curl`/`WebFetch` retornam 403/renegotiation sem certificado de
 *   cliente, mesmo pedindo só a página de docs). Os paths abaixo vêm
 *   de corroboração cruzada entre duas fontes independentes (Manual de
 *   Conectividade SEFIN; resumos técnicos de integradores) — NUNCA
 *   inventados.
 * - ADN (parâmetros municipais/convênio): path documentado como
 *   `/parametrizacao/parametros_municipais/{codigoMunicipio}/convenio`,
 *   sob o host ADN (não SEFIN) — também bloqueado por rede/mTLS nesta
 *   sessão ao testar sem certificado.
 *
 * Nosso valor interno "homologation" corresponde, nesta fase, ao
 * ambiente real de PRODUÇÃO RESTRITA (RTC) — não existe uma distinção
 * de "homologação verdadeira" separada sendo usada aqui; produção real
 * nunca é chamada (ver isTransmissionEnvironmentAllowed em @ir/types).
 */
const SEFIN_BASE_URLS: Record<NfseEnvironment, string> = {
  homologation: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
  production: "https://sefin.nfse.gov.br/API/SefinNacional",
};
const ADN_BASE_URLS: Record<NfseEnvironment, string> = {
  homologation: "https://adn.producaorestrita.nfse.gov.br",
  production: "https://adn.nfse.gov.br",
};

export function buildMunicipalParametersUrl(ibgeCode: string, environment: NfseEnvironment): string {
  return `${ADN_BASE_URLS[environment]}/parametrizacao/parametros_municipais/${ibgeCode}/convenio`;
}
export function buildTransmitDpsUrl(environment: NfseEnvironment): string {
  return `${SEFIN_BASE_URLS[environment]}/nfse`;
}
export function buildNfseByAccessKeyUrl(accessKey: string, environment: NfseEnvironment): string {
  return `${SEFIN_BASE_URLS[environment]}/nfse/${accessKey}`;
}
export function buildDpsByIdUrl(dpsId: string, environment: NfseEnvironment): string {
  return `${SEFIN_BASE_URLS[environment]}/dps/${dpsId}`;
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
