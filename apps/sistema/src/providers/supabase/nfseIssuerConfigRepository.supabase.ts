import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseCertificateStoredStatus, NfseCertificateType, NfseEnvironment, NfseIssuerConfig } from "@ir/types";
import type { IssuerConfigChanges, IssuerConfigRepository, NewIssuerConfigRecord } from "@ir/core";

const TABLE = "nfse_issuer_configs";
const COLUMNS =
  "id, company_name, trade_name, cnpj, municipal_registration, municipality, state, ibge_code, tax_regime, special_tax_regime, " +
  "environment, certificate_type, certificate_status, certificate_valid_until, certificate_reference, dps_series, notes, " +
  "created_by, updated_by, created_at, updated_at";

interface IssuerConfigRow {
  id: string;
  company_name: string;
  trade_name: string | null;
  cnpj: string;
  municipal_registration: string;
  municipality: string;
  state: string;
  ibge_code: string;
  tax_regime: string | null;
  special_tax_regime: string | null;
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
    municipality: row.municipality,
    state: row.state,
    ibgeCode: row.ibge_code,
    taxRegime: row.tax_regime ?? undefined,
    specialTaxRegime: row.special_tax_regime ?? undefined,
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
  if (record.municipality !== undefined) row.municipality = record.municipality;
  if (record.state !== undefined) row.state = record.state;
  if (record.ibgeCode !== undefined) row.ibge_code = record.ibgeCode;
  if (record.taxRegime !== undefined) row.tax_regime = record.taxRegime ?? null;
  if (record.specialTaxRegime !== undefined) row.special_tax_regime = record.specialTaxRegime ?? null;
  if (record.environment !== undefined) row.environment = record.environment;
  if (record.certificateType !== undefined) row.certificate_type = record.certificateType;
  if (record.certificateStatus !== undefined) row.certificate_status = record.certificateStatus;
  if (record.certificateValidUntil !== undefined) row.certificate_valid_until = record.certificateValidUntil ?? null;
  if (record.certificateReference !== undefined) row.certificate_reference = record.certificateReference ?? null;
  if (record.dpsSeries !== undefined) row.dps_series = record.dpsSeries ?? null;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  return row;
}

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
