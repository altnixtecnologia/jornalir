import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseServiceProfile } from "@ir/types";
import type { NewServiceProfileRecord, ServiceProfileChanges, ServiceProfileListQuery, ServiceProfileRepository } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "nfse_service_profiles";
const COLUMNS =
  "id, name, active, c_trib_nac, c_trib_mun, c_nbs, default_location_municipality, default_location_ibge_code, " +
  "issqn_taxation, special_tax_regime, c_atv_sn, cst_ibs_cbs, c_class_trib, c_ind_op, notes, created_by, updated_by, created_at, updated_at";

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
  special_tax_regime: string | null;
  c_atv_sn: string | null;
  cst_ibs_cbs: string | null;
  c_class_trib: string | null;
  c_ind_op: string | null;
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
    specialTaxRegime: row.special_tax_regime ?? undefined,
    cAtvSN: row.c_atv_sn ?? undefined,
    cstIbsCbs: row.cst_ibs_cbs ?? undefined,
    cClassTrib: row.c_class_trib ?? undefined,
    cIndOp: row.c_ind_op ?? undefined,
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
  if (record.specialTaxRegime !== undefined) row.special_tax_regime = record.specialTaxRegime ?? null;
  if (record.cAtvSN !== undefined) row.c_atv_sn = record.cAtvSN ?? null;
  if (record.cstIbsCbs !== undefined) row.cst_ibs_cbs = record.cstIbsCbs ?? null;
  if (record.cClassTrib !== undefined) row.c_class_trib = record.cClassTrib ?? null;
  if (record.cIndOp !== undefined) row.c_ind_op = record.cIndOp ?? null;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  return row;
}

// Perfil demonstrativo (preview) — cTribNac/cTribMun/cNBS reaproveitam o
// MESMO trio já usado como exemplo nos testes do DPS builder (ver
// packages/core/test/dps-builder.test.ts — "Veiculação de anúncio
// publicitário"), nunca um código tributário real presumido pela
// aplicação (ver docs/NFSE-NACIONAL-ARQUITETURA.md — cTribNac/cTribMun/
// cNBS são sempre texto livre informado pelo usuário, nunca um enum
// hardcoded). Antes usava "140202" aqui, um valor sem nenhuma origem no
// projeto — corrigido pra não narrar dois exemplos diferentes pro mesmo
// cenário de "Publicidade".
const PREVIEW_SERVICE_PROFILE: NfseServiceProfile = {
  id: "preview-perfil-servico-1",
  name: "Divulgação institucional (demonstração)",
  active: true,
  cTribNac: "140619",
  cTribMun: "706",
  cNBS: "1.1406.19.00",
  defaultLocationMunicipality: "São João do Sul",
  defaultLocationIbgeCode: "4216404",
  notes: "Perfil de demonstração (preview) — ajustar os códigos reais antes de usar fora do preview.",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

/** Perfis de serviço (Parte 1, item 5) — nunca excluídos, só desativados (active=false), mesmo depois de usados em rascunhos. */
export function createServiceProfileRepositorySupabase(client: SupabaseClient): ServiceProfileRepository {
  return {
    async list(query: ServiceProfileListQuery = {}) {
      if (isLocalPreviewEnabled()) return [PREVIEW_SERVICE_PROFILE];
      let builder = client.from(TABLE).select(COLUMNS).order("name", { ascending: true });
      if (query.activeOnly) builder = builder.eq("active", true);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as ServiceProfileRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_SERVICE_PROFILE.id === id ? PREVIEW_SERVICE_PROFILE : null;
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
