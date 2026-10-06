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

const BASE_URLS: Record<NfseEnvironment, string> = {
  // Produção Restrita/Homologação — produção real nunca é chamada
  // nesta fase (ver isTransmissionEnvironmentAllowed em @ir/types).
  // Pacote de esquema XSD vigente usado em homologação: ver
  // NFSE_SCHEMA_PACKAGE_HOMOLOGATION em @ir/types — produção usa um
  // pacote PRÓPRIO e diferente, nunca misturado com este.
  homologation: "https://adn.producaorestrita.nfse.gov.br",
  production: "https://adn.nfse.gov.br",
};

/**
 * Transmissão real bloqueada (ajuste de segurança pós-revisão, item 7)
 * — nenhuma chamada à API Nacional pode ocorrer enquanto estes três
 * pontos não estiverem efetivamente confirmados/implementados:
 * 1) algoritmo/canonicalização de assinatura confirmados contra fonte
 *    oficial vigente (ver signature.ts — hoje NÃO confirmado);
 * 2) validação XSD REAL contra o schema oficial (hoje só existe
 *    validação estrutural interna, ver validateDpsXmlStructure em
 *    dps-builder.ts — nunca chamada de "validação XSD");
 * 3) extração real de material criptográfico do certificado A1 (ver
 *    certificate-provider.ts — hoje lança erro proposital).
 */
export class RealTransmissionNotReadyError extends Error {
  constructor() {
    super(
      "Transmissão real bloqueada: assinatura digital (algoritmo/canonicalização oficiais), validação XSD real e extração de certificado real ainda não foram confirmados/implementados. Nenhuma chamada à API Nacional pode ocorrer enquanto isso não for resolvido.",
    );
  }
}

/**
 * Implementação real via `fetch` — mas TODO método lança
 * `RealTransmissionNotReadyError` de propósito (ver guarda acima).
 * Existe pra completar a arquitetura de ponta a ponta (URLs de
 * homologação/produção já definidas, nunca misturadas), não pra ser
 * de fato chamada ainda. Habilitar isto exige remover os `throw`
 * abaixo, só depois que os três pontos da guarda estiverem resolvidos.
 */
export class FetchNationalNfseProvider implements NationalNfseProvider {
  constructor(private readonly mutualTlsAgent?: unknown) {}

  async getMunicipalParameters(_ibgeCode: string, _environment: NfseEnvironment): Promise<MunicipalParameters> {
    throw new RealTransmissionNotReadyError();
  }

  async transmitDps(_signedDpsXml: string, _environment: NfseEnvironment): Promise<NationalNfseResponseEnvelope> {
    throw new RealTransmissionNotReadyError();
  }

  async getNfseByAccessKey(_accessKey: string, _environment: NfseEnvironment): Promise<string> {
    throw new RealTransmissionNotReadyError();
  }

  async getDpsById(_dpsId: string, _environment: NfseEnvironment): Promise<string | null> {
    throw new RealTransmissionNotReadyError();
  }
}
