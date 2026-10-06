import { isValidDpsSeriesFormat, NFSE_SUGGESTED_ISSUER_DEFAULTS, type NfseIssuerConfig, type NfseSimplesNacionalOption, type NfseSpecialTaxRegimeCode } from "@ir/types";
import { onlyDigits } from "../clientes/client-validation";
import { IssuerConfigValidationError, type IssuerConfigRepository, type NewIssuerConfigRecord } from "./issuer-config-repository";

export interface IssuerConfigInput {
  companyName: string;
  tradeName?: string;
  cnpj: string;
  municipalRegistration: string;
  municipality: string;
  state: string;
  ibgeCode: string;
  taxRegime?: string;
  specialTaxRegime?: string;
  /** `opSimpNac` do XSD oficial (grupo `regTrib`) — obrigatório pra transmitir, nunca um default assumido. */
  simplesNacionalOption?: NfseSimplesNacionalOption;
  /** `regEspTrib` do XSD oficial (grupo `regTrib`) — obrigatório pra transmitir, nunca um default assumido (mesmo "Nenhum" exige escolha explícita). */
  specialTaxRegimeCode?: NfseSpecialTaxRegimeCode;
  environment: NfseIssuerConfig["environment"];
  certificateType: NfseIssuerConfig["certificateType"];
  certificateStatus: NfseIssuerConfig["certificateStatus"];
  certificateValidUntil?: string;
  certificateReference?: string;
  dpsSeries?: string;
  notes?: string;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: IssuerConfigInput): NewIssuerConfigRecord {
  return {
    companyName: input.companyName.trim(),
    tradeName: trimOrUndefined(input.tradeName),
    cnpj: onlyDigits(input.cnpj),
    municipalRegistration: input.municipalRegistration.trim(),
    municipality: input.municipality.trim(),
    state: input.state.trim().toUpperCase().slice(0, 2),
    ibgeCode: input.ibgeCode.trim(),
    taxRegime: trimOrUndefined(input.taxRegime),
    specialTaxRegime: trimOrUndefined(input.specialTaxRegime),
    simplesNacionalOption: input.simplesNacionalOption,
    specialTaxRegimeCode: input.specialTaxRegimeCode,
    environment: input.environment,
    certificateType: input.certificateType,
    certificateStatus: input.certificateStatus,
    certificateValidUntil: input.certificateValidUntil || undefined,
    certificateReference: trimOrUndefined(input.certificateReference),
    dpsSeries: trimOrUndefined(input.dpsSeries),
    notes: trimOrUndefined(input.notes),
  };
}

function assertValid(record: NewIssuerConfigRecord): void {
  if (!record.companyName) throw new IssuerConfigValidationError("Informe a razão social do prestador.");
  if (!record.cnpj || record.cnpj.length !== 14) throw new IssuerConfigValidationError("Informe um CNPJ válido do prestador.");
  if (!record.municipalRegistration) throw new IssuerConfigValidationError("Informe a inscrição municipal do prestador.");
  if (!record.municipality) throw new IssuerConfigValidationError("Informe o município do prestador.");
  if (!record.state || record.state.length !== 2) throw new IssuerConfigValidationError("Informe a UF do prestador.");
  if (!record.ibgeCode) throw new IssuerConfigValidationError("Informe o código IBGE do município do prestador.");
  if (record.certificateType === "not_configured" && record.certificateStatus === "configured") {
    throw new IssuerConfigValidationError("Selecione um tipo de certificado (A1/A3) antes de marcar como configurado.");
  }
  if (record.dpsSeries !== undefined && !isValidDpsSeriesFormat(record.dpsSeries)) {
    throw new IssuerConfigValidationError("Série da DPS inválida — deve ter de 1 a 5 dígitos numéricos.");
  }
}

/**
 * Configuração fiscal do emissor (Parte 1, item 4) — uma única
 * configuração ativa por vez; nunca cria uma segunda linha
 * concorrente (ver getOrCreateDefault). Dados sugeridos (CNPJ/IM/
 * município da Informativo Regional) são só `defaultValue`, nunca
 * aplicados silenciosamente — o usuário sempre confirma salvando.
 * Regime tributário/ambiente/certificado nunca têm valor assumido:
 * ficam vazios/"não configurado" até o usuário definir explicitamente.
 */
export class IssuerConfigService {
  constructor(private readonly configs: IssuerConfigRepository) {}

  getCurrent(): Promise<NfseIssuerConfig | null> {
    return this.configs.getCurrent();
  }

  /** Sugestão pra tela de configuração quando NENHUMA configuração existe ainda — nunca persiste nada por conta própria. */
  getSuggestedDefaults(): IssuerConfigInput {
    return {
      companyName: NFSE_SUGGESTED_ISSUER_DEFAULTS.companyName,
      cnpj: NFSE_SUGGESTED_ISSUER_DEFAULTS.cnpj,
      municipalRegistration: NFSE_SUGGESTED_ISSUER_DEFAULTS.municipalRegistration,
      municipality: NFSE_SUGGESTED_ISSUER_DEFAULTS.municipality,
      state: NFSE_SUGGESTED_ISSUER_DEFAULTS.state,
      ibgeCode: NFSE_SUGGESTED_ISSUER_DEFAULTS.ibgeCode,
      environment: "homologation",
      certificateType: "not_configured",
      certificateStatus: "not_configured",
    };
  }

  async save(input: IssuerConfigInput): Promise<NfseIssuerConfig> {
    const record = normalize(input);
    assertValid(record);
    const current = await this.configs.getCurrent();
    if (!current) return this.configs.create(record);
    return this.configs.update(current.id, record);
  }
}
