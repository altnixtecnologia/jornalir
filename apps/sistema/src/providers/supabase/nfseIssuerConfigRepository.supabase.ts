import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NfseAdministrativeTaxRegime,
  NfseCertificateStoredStatus,
  NfseCertificateType,
  NfseEnvironment,
  NfseIbsCbsSimplesNacionalRegime,
  NfseIssuerConfig,
  NfseSimplesNacionalOption,
  NfseSpecialTaxRegimeCode,
} from "@ir/types";
import type { IssuerConfigChanges, IssuerConfigRepository, NewIssuerConfigRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "nfse_issuer_configs";
// tax_regime/special_tax_regime (texto livre) são colunas DEPRECADAS
// (revisão RTC/IBS-CBS — ver migration 20261029100500): nunca mais
// lidas/escritas pela aplicação, mas preservadas no banco (dado
// histórico eventual, nunca descartado). administrative_tax_regime e
// special_tax_regime_code são os campos atuais.
const COLUMNS =
  "id, company_name, trade_name, cnpj, municipal_registration, state_registration, municipality, state, ibge_code, administrative_tax_regime, " +
  "simples_nacional_option, special_tax_regime_code, ibs_cbs_simples_nacional_regime, " +
  "environment, certificate_type, certificate_status, certificate_valid_until, certificate_reference, dps_series, notes, " +
  "created_by, updated_by, created_at, updated_at";

interface IssuerConfigRow {
  id: string;
  company_name: string;
  trade_name: string | null;
  cnpj: string;
  municipal_registration: string;
  state_registration: string | null;
  municipality: string;
  state: string;
  ibge_code: string;
  administrative_tax_regime: NfseAdministrativeTaxRegime | null;
  simples_nacional_option: NfseSimplesNacionalOption | null;
  special_tax_regime_code: NfseSpecialTaxRegimeCode | null;
  ibs_cbs_simples_nacional_regime: NfseIbsCbsSimplesNacionalRegime | null;
  environment: NfseEnvironment;
  certificate_type: NfseCertificateType;
  certificate_status: NfseCertificateStoredStatus;
  certificate_valid_until: string | null;
  certificate_reference: string | null;
  dps_series: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: IssuerConfigRow): NfseIssuerConfig {
  return {
    id: row.id,
    companyName: row.company_name,
    tradeName: row.trade_name ?? undefined,
    cnpj: row.cnpj,
    municipalRegistration: row.municipal_registration,
    stateRegistration: row.state_registration ?? undefined,
    municipality: row.municipality,
    state: row.state,
    ibgeCode: row.ibge_code,
    administrativeTaxRegime: row.administrative_tax_regime ?? undefined,
    simplesNacionalOption: row.simples_nacional_option ?? undefined,
    specialTaxRegimeCode: row.special_tax_regime_code ?? undefined,
    ibsCbsSimplesNacionalRegime: row.ibs_cbs_simples_nacional_regime ?? undefined,
    environment: row.environment,
    certificateType: row.certificate_type,
    certificateStatus: row.certificate_status,
    certificateValidUntil: row.certificate_valid_until ?? undefined,
    certificateReference: row.certificate_reference ?? undefined,
    dpsSeries: row.dps_series ?? undefined,
    notes: row.notes ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    updatedByProfileId: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewIssuerConfigRecord | IssuerConfigChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.companyName !== undefined) row.company_name = record.companyName;
  if (record.tradeName !== undefined) row.trade_name = record.tradeName ?? null;
  if (record.cnpj !== undefined) row.cnpj = record.cnpj;
  if (record.municipalRegistration !== undefined) row.municipal_registration = record.municipalRegistration;
  if (record.stateRegistration !== undefined) row.state_registration = record.stateRegistration ?? null;
  if (record.municipality !== undefined) row.municipality = record.municipality;
  if (record.state !== undefined) row.state = record.state;
  if (record.ibgeCode !== undefined) row.ibge_code = record.ibgeCode;
  if (record.administrativeTaxRegime !== undefined) row.administrative_tax_regime = record.administrativeTaxRegime ?? null;
  if (record.simplesNacionalOption !== undefined) row.simples_nacional_option = record.simplesNacionalOption ?? null;
  if (record.specialTaxRegimeCode !== undefined) row.special_tax_regime_code = record.specialTaxRegimeCode ?? null;
  if (record.ibsCbsSimplesNacionalRegime !== undefined) row.ibs_cbs_simples_nacional_regime = record.ibsCbsSimplesNacionalRegime ?? null;
  if (record.environment !== undefined) row.environment = record.environment;
  if (record.certificateType !== undefined) row.certificate_type = record.certificateType;
  if (record.certificateStatus !== undefined) row.certificate_status = record.certificateStatus;
  if (record.certificateValidUntil !== undefined) row.certificate_valid_until = record.certificateValidUntil ?? null;
  if (record.certificateReference !== undefined) row.certificate_reference = record.certificateReference ?? null;
  if (record.dpsSeries !== undefined) row.dps_series = record.dpsSeries ?? null;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  return row;
}

// Configuração demonstrativa (preview) — usa os mesmos valores sugeridos
// de NFSE_SUGGESTED_ISSUER_DEFAULTS (@ir/types), só que aqui já "salvos"
// pra demonstrar a tela de configurações/certificado/nova NFS-e sem
// depender do Supabase remoto. São João do Sul/SC continua sendo só o
// cenário de homologação deste preview — nunca hardcoded na aplicação
// (ver NFSE_SUGGESTED_ISSUER_DEFAULTS, item 16 da tarefa).
const PREVIEW_ISSUER_CONFIG: NfseIssuerConfig = {
  id: "preview-issuer-config-1",
  companyName: "INFORMATIVO REGIONAL LTDA",
  cnpj: "23970969000190",
  municipalRegistration: "1000546",
  municipality: "São João do Sul",
  state: "SC",
  ibgeCode: "4216404",
  administrativeTaxRegime: "simples_nacional",
  simplesNacionalOption: "me_epp",
  specialTaxRegimeCode: "none",
  ibsCbsSimplesNacionalRegime: "simples_both",
  environment: "homologation",
  certificateType: "a1",
  certificateStatus: "configured",
  certificateValidUntil: "2027-01-01",
  dpsSeries: "1",
  notes: "Configuração de demonstração (preview) — nenhum dado real.",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

/**
 * Configuração fiscal do emissor (Parte 1, item 4) — uma única
 * configuração ativa: `getCurrent()` sempre busca a linha mais
 * recente (`order by updated_at desc limit 1`), nunca presume um id
 * fixo. created_by/updated_by são preenchidos pelo trigger
 * `set_nfse_issuer_config_actor` (auth.uid()), nunca pela aplicação.
 */
export function createIssuerConfigRepositorySupabase(client: SupabaseClient): IssuerConfigRepository {
  return {
    async getCurrent() {
      if (isLocalPreviewEnabled()) return PREVIEW_ISSUER_CONFIG;
      const { data, error } = await client.from(TABLE).select(COLUMNS).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as IssuerConfigRow) : null;
    },

    async create(record) {
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as IssuerConfigRow);
    },

    async update(id, changes) {
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as IssuerConfigRow);
    },
  };
}
