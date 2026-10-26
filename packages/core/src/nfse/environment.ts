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
 *   mTLS pra qualquer acesso, inclusive navegar a documentação.
 *   CORRIGIDO na auditoria estrutural de 26/10/2026 (item 7 — "os
 *   endereços de Produção Restrita e Produção são DISTINTOS, não o
 *   mesmo path com host diferente"): confirmado ao ler diretamente a
 *   página oficial `gov.br/nfse/.../apis-prod-restrita-e-producao`
 *   (fonte primária, não um resumo de terceiro) que:
 *   - Produção Restrita: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/...`
 *     (COM o segmento `/API/`);
 *   - Produção: `https://sefin.nfse.gov.br/SefinNacional/...`
 *     (SEM o segmento `/API/` — path mais curto, não o mesmo prefixo
 *     da Produção Restrita só com host trocado).
 *   Confirmado por 2 buscas independentes (a própria página oficial +
 *   um resumo de terceiro que cita a mesma distinção). A versão
 *   anterior deste arquivo usava `/API/SefinNacional` nos DOIS
 *   ambientes — corrigida aqui. Produção continua com
 *   `operationsEnabled: false`, então esta correção não abre nenhuma
 *   chamada real; é só preparação para quando for religado.
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
    // SEM "/API/" — path distinto do de Produção Restrita, confirmado contra a página oficial
    // (ver comentário do módulo). Nunca "corrigir" isto de volta pra incluir "/API/" sem reconferir a fonte.
    sefinBaseUrl: "https://sefin.nfse.gov.br/SefinNacional",
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
