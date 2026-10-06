import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseServiceProfile } from "@ir/types";
import type { NewServiceProfileRecord, ServiceProfileChanges, ServiceProfileListQuery, ServiceProfileRepository } from "@ir/core";

const TABLE = "nfse_service_profiles";
const COLUMNS =
  "id, name, active, c_trib_nac, c_trib_mun, c_nbs, default_location_municipality, default_location_ibge_code, " +
  "issqn_taxation, issqn_rate, special_tax_regime, notes, created_by, updated_by, created_at, updated_at";

interface ServiceProfileRow {
  id: string;
  name: string;
  active: boolean;
  c_trib_nac: string | null;
  c_trib_mun: string | null;
  c_nbs: string | null;
  default_location_municipality: string | null;
  default_location_ibge_code: string | null;
  issqn_taxation: string | null;
  issqn_rate: number | null;
  special_tax_regime: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: ServiceProfileRow): NfseServiceProfile {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    cTribNac: row.c_trib_nac ?? undefined,
    cTribMun: row.c_trib_mun ?? undefined,
    cNBS: row.c_nbs ?? undefined,
    defaultLocationMunicipality: row.default_location_municipality ?? undefined,
    defaultLocationIbgeCode: row.default_location_ibge_code ?? undefined,
    issqnTaxation: row.issqn_taxation ?? undefined,
    issqnRate: row.issqn_rate !== null ? Number(row.issqn_rate) : undefined,
    specialTaxRegime: row.special_tax_regime ?? undefined,
    notes: row.notes ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    updatedByProfileId: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewServiceProfileRecord | ServiceProfileChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.name !== undefined) row.name = record.name;
  if (record.active !== undefined) row.active = record.active;
  if (record.cTribNac !== undefined) row.c_trib_nac = record.cTribNac ?? null;
  if (record.cTribMun !== undefined) row.c_trib_mun = record.cTribMun ?? null;
  if (record.cNBS !== undefined) row.c_nbs = record.cNBS ?? null;
  if (record.defaultLocationMunicipality !== undefined) row.default_location_municipality = record.defaultLocationMunicipality ?? null;
  if (record.defaultLocationIbgeCode !== undefined) row.default_location_ibge_code = record.defaultLocationIbgeCode ?? null;
  if (record.issqnTaxation !== undefined) row.issqn_taxation = record.issqnTaxation ?? null;
  if (record.issqnRate !== undefined) row.issqn_rate = record.issqnRate ?? null;
  if (record.specialTaxRegime !== undefined) row.special_tax_regime = record.specialTaxRegime ?? null;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  return row;
}

/** Perfis de serviço (Parte 1, item 5) — nunca excluídos, só desativados (active=false), mesmo depois de usados em rascunhos. */
export function createServiceProfileRepositorySupabase(client: SupabaseClient): ServiceProfileRepository {
  return {
    async list(query: ServiceProfileListQuery = {}) {
      let builder = client.from(TABLE).select(COLUMNS).order("name", { ascending: true });
      if (query.activeOnly) builder = builder.eq("active", true);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as ServiceProfileRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ServiceProfileRow) : null;
    },

    async create(record) {
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ServiceProfileRow);
    },

    async update(id, changes) {
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ServiceProfileRow);
    },
  };
}
