import { isValidDpsSeriesFormat, type NfseCertificateInfo, type NfseIssuerConfig } from "@ir/types";

/**
 * Guarda CENTRAL de prontidão pra emissão real em homologação/Produção
 * Restrita (Parte 2B, item "Transmissão continua bloqueada" → Parte
 * 2C, item 15). Única função que decide "pronto pra transmitir" —
 * nunca duplicar esta lista em outro ponto do código (mesmo princípio
 * de `isTransmissionEnvironmentAllowed` em @ir/types). Função PURA:
 * recebe tudo já calculado/consultado pelo chamador (nunca acessa
 * banco/rede aqui), pra ficar fácil de testar com fixtures.
 *
 * Enquanto QUALQUER item faltar, `ready` é `false` e `missing` lista
 * EXATAMENTE o que falta (nunca uma mensagem genérica) — o admin
 * precisa saber se é o regime do Simples, o certificado, a série da
 * DPS ou o XML ainda inválido no XSD. `transmit()` em
 * transmission-service.ts e `RealTransmissionNotReadyError` em
 * national-nfse-provider.ts são guardas REDUNDANTES e independentes
 * desta — mesmo que esta função um dia retorne `ready: true`, a
 * chamada real à API nacional continua bloqueada nesses outros dois
 * pontos até serem explicitamente habilitados.
 */
export interface HomologationReadinessInput {
  issuerConfig: NfseIssuerConfig | null;
  activeCertificate: NfseCertificateInfo | null;
  /** Resultado da ÚLTIMA validação XSD real (ver xsd-validator.ts) feita sobre o XML que seria efetivamente transmitido — nunca um valor assumido/cacheado de uma execução antiga de outro rascunho. */
  lastXsdValidationValid: boolean | null;
  cTribNacConfigured: boolean;
}

export interface HomologationReadinessResult {
  ready: boolean;
  missing: string[];
}

export function checkHomologationReadiness(input: HomologationReadinessInput): HomologationReadinessResult {
  const missing: string[] = [];

  if (!input.issuerConfig) {
    missing.push("Configuração fiscal do prestador");
  } else {
    if (!input.issuerConfig.dpsSeries || !isValidDpsSeriesFormat(input.issuerConfig.dpsSeries)) {
      missing.push("Série da DPS (configuração do prestador)");
    }
    // Grupo regTrib (Parte 2C) — obrigatório no XSD oficial, nunca um default assumido.
    if (!input.issuerConfig.simplesNacionalOption) {
      missing.push("Situação do prestador perante o Simples Nacional (Configurações NFS-e)");
    }
    if (!input.issuerConfig.specialTaxRegimeCode) {
      missing.push('Regime especial de tributação do prestador (Configurações NFS-e — escolha "Nenhum" se não houver)');
    }
  }

  if (!input.activeCertificate) {
    missing.push("Certificado digital A1 válido configurado");
  } else {
    if (new Date(input.activeCertificate.validUntil).getTime() < Date.now()) {
      missing.push("Certificado digital vencido — substitua por um certificado válido");
    }
    if (input.issuerConfig && input.activeCertificate.subjectCnpj && input.activeCertificate.subjectCnpj !== input.issuerConfig.cnpj.replace(/\D/g, "")) {
      missing.push("CNPJ do certificado não corresponde ao CNPJ do prestador configurado");
    }
  }

  if (!input.cTribNacConfigured) missing.push("Código de tributação nacional — cTribNac (perfil de serviço)");

  if (input.lastXsdValidationValid !== true) {
    missing.push("Validação XSD real da DPS (ver xsd-validator.ts) — DPS gerada ainda não valida contra o esquema oficial");
  }

  return { ready: missing.length === 0, missing };
}
