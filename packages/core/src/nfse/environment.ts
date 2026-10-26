import type { NfseEnvironment } from "@ir/types";

export interface NfseEnvironmentConfig {
  key: NfseEnvironment;
  label: string;
  sefinBaseUrl: string;
  municipalParametersBaseUrl: string;
  operationsEnabled: boolean;
}

/**
 * Configuração central das URLs fiscais (SEFIN/ADN) por ambiente —
 * substitui as constantes antes duplicadas em national-nfse-provider.ts.
 * URLs confirmadas por corroboração cruzada entre múltiplas fontes
 * independentes (manual oficial de contribuintes da ADN; bibliotecas
 * de integração de terceiros; guias técnicos de integradores),
 * NUNCA inventadas:
 * - SEFIN Nacional (emissão/consulta de DPS/NFS-e): exige certificado
 *   mTLS pra qualquer acesso, inclusive navegar a documentação. O
 *   segmento `/API/` (ex.: `.../API/SefinNacional/nfse`) foi reforçado
 *   na etapa de integração final (25/10/2026) por 3 fontes
 *   independentes que convergem: (1) confirmação empírica desta sessão
 *   (o Swagger ao vivo só responde — mesmo que com erro de mTLS — sob
 *   esse path); (2) a biblioteca open-source `pynfse-nacional` (GitHub,
 *   roberto-mello) lista exatamente
 *   `sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index`
 *   (homologação) e `sefin.nfse.gov.br/API/SefinNacional/docs/index`
 *   (produção) como os endereços do Swagger; (3) um post de fórum
 *   (2026) relatando uma chamada real a
 *   `.../API/SefinNacional/nfse` que retornou um erro FUNCIONAL
 *   (`E4007 Não foi possível obter o certificado de cliente` — erro de
 *   certificado, não 404), o que só acontece se o path em si existir e
 *   for roteado corretamente pela SEFIN. Antes desta etapa, um post
 *   isolado citando `.../SefinNacional/nfse` sem `/API/` era a única
 *   fonte contrária — permanece sem corroboração independente.
 * - ADN (parâmetros municipais/convênio/alíquota): o path atual é
 *   `/parametrizacao/{codigoMunicipio}/convenio` e
 *   `/parametrizacao/{codigoMunicipio}/{codigoServico}/{competencia}/aliquota`,
 *   sob o host ADN (não SEFIN). O prefixo `/parametros_municipais` é um
 *   esquema ANTERIOR/legado (manuais de 2025) e não é mais usado nos
 *   paths atuais — nunca combinar os dois prefixos na mesma URL.
 *
 * Nosso valor interno "homologation" corresponde, nesta fase, ao
 * ambiente real de PRODUÇÃO RESTRITA (RTC) — não existe uma distinção
 * de "homologação verdadeira" separada sendo usada aqui; produção real
 * nunca é chamada (ver isTransmissionEnvironmentAllowed em @ir/types).
 */
const NFSE_ENVIRONMENT_CONFIGS: Record<NfseEnvironment, NfseEnvironmentConfig> = {
  homologation: {
    key: "homologation",
    label: "Produção Restrita",
    sefinBaseUrl: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
    municipalParametersBaseUrl: "https://adn.producaorestrita.nfse.gov.br/parametrizacao",
    operationsEnabled: true,
  },
  production: {
    key: "production",
    label: "Produção",
    sefinBaseUrl: "https://sefin.nfse.gov.br/API/SefinNacional",
    municipalParametersBaseUrl: "https://adn.nfse.gov.br/parametrizacao",
    operationsEnabled: false,
  },
};

/** Configuração central das URLs fiscais. Produção existe, mas permanece operacionalmente bloqueada. */
export function getNfseEnvironmentConfig(environment: NfseEnvironment): NfseEnvironmentConfig {
  return NFSE_ENVIRONMENT_CONFIGS[environment];
}

export function assertNfseOperationAllowed(environment: NfseEnvironment): void {
  if (!getNfseEnvironmentConfig(environment).operationsEnabled) {
    throw new Error("Operações NFS-e em produção estão bloqueadas nesta etapa.");
  }
}
