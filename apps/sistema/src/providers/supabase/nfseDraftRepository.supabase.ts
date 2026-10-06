import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientKind, NfseDraft, NfseDraftStatus } from "@ir/types";
import type { DraftChanges, DraftListQuery, DraftRepository, NewDraftRecord } from "@ir/core";

const TABLE = "nfse_drafts";
const COLUMNS =
  "id, internal_reference, client_id, " +
  "tomador_kind, tomador_name, tomador_cpf, tomador_cnpj, tomador_municipal_registration, tomador_state_registration, " +
  "tomador_zip, tomador_street, tomador_number, tomador_complement, tomador_neighborhood, tomador_city, tomador_state, " +
  "tomador_ibge_code, tomador_email, tomador_phone, " +
  "service_profile_id, c_trib_nac, c_trib_mun, c_nbs, issqn_taxation, fiscal_special_tax_regime, location_municipality, location_ibge_code, " +
  "competency_date, service_value, service_description, notes, status, " +
  "created_by, updated_by, created_at, updated_at";

interface DraftRow {
  id: string;
  internal_reference: string;
  client_id: string;
  tomador_kind: ClientKind;
  tomador_name: string;
  tomador_cpf: string | null;
  tomador_cnpj: string | null;
  tomador_municipal_registration: string | null;
  tomador_state_registration: string | null;
  tomador_zip: string | null;
  tomador_street: string | null;
  tomador_number: string | null;
  tomador_complement: string | null;
  tomador_neighborhood: string | null;
  tomador_city: string | null;
  tomador_state: string | null;
  tomador_ibge_code: string | null;
  tomador_email: string | null;
  tomador_phone: string | null;
  service_profile_id: string | null;
  c_trib_nac: string | null;
  c_trib_mun: string | null;
  c_nbs: string | null;
  issqn_taxation: string | null;
  fiscal_special_tax_regime: string | null;
  location_municipality: string | null;
  location_ibge_code: string | null;
  competency_date: string;
  service_value: number;
  service_description: string;
  notes: string | null;
  status: NfseDraftStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: DraftRow): NfseDraft {
  return {
    id: row.id,
    reference: row.internal_reference,
    clientId: row.client_id,
    tomador: {
      sourceClientId: row.client_id,
      kind: row.tomador_kind,
      name: row.tomador_name,
      cpf: row.tomador_cpf ?? undefined,
      cnpj: row.tomador_cnpj ?? undefined,
      municipalRegistration: row.tomador_municipal_registration ?? undefined,
      stateRegistration: row.tomador_state_registration ?? undefined,
      zip: row.tomador_zip ?? undefined,
      street: row.tomador_street ?? undefined,
      number: row.tomador_number ?? undefined,
      complement: row.tomador_complement ?? undefined,
      neighborhood: row.tomador_neighborhood ?? undefined,
      city: row.tomador_city ?? undefined,
      state: row.tomador_state ?? undefined,
      ibgeCode: row.tomador_ibge_code ?? undefined,
      email: row.tomador_email ?? undefined,
      phone: row.tomador_phone ?? undefined,
    },
    serviceProfileId: row.service_profile_id ?? undefined,
    fiscal: {
      sourceServiceProfileId: row.service_profile_id ?? undefined,
      cTribNac: row.c_trib_nac ?? undefined,
      cTribMun: row.c_trib_mun ?? undefined,
      cNBS: row.c_nbs ?? undefined,
      issqnTaxation: row.issqn_taxation ?? undefined,
      specialTaxRegime: row.fiscal_special_tax_regime ?? undefined,
      locationMunicipality: row.location_municipality ?? undefined,
      locationIbgeCode: row.location_ibge_code ?? undefined,
    },
    competencyDate: row.competency_date,
    serviceValue: Number(row.service_value),
    serviceDescription: row.service_description,
    notes: row.notes ?? undefined,
    status: row.status,
    createdByProfileId: row.created_by ?? undefined,
    updatedByProfileId: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewDraftRecord | DraftChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.clientId !== undefined) row.client_id = record.clientId;
  if (record.tomador !== undefined) {
    row.tomador_kind = record.tomador.kind;
    row.tomador_name = record.tomador.name;
    row.tomador_cpf = record.tomador.cpf ?? null;
    row.tomador_cnpj = record.tomador.cnpj ?? null;
    row.tomador_municipal_registration = record.tomador.municipalRegistration ?? null;
    row.tomador_state_registration = record.tomador.stateRegistration ?? null;
    row.tomador_zip = record.tomador.zip ?? null;
    row.tomador_street = record.tomador.street ?? null;
    row.tomador_number = record.tomador.number ?? null;
    row.tomador_complement = record.tomador.complement ?? null;
    row.tomador_neighborhood = record.tomador.neighborhood ?? null;
    row.tomador_city = record.tomador.city ?? null;
    row.tomador_state = record.tomador.state ?? null;
    row.tomador_ibge_code = record.tomador.ibgeCode ?? null;
    row.tomador_email = record.tomador.email ?? null;
    row.tomador_phone = record.tomador.phone ?? null;
  }
  if (record.serviceProfileId !== undefined) row.service_profile_id = record.serviceProfileId ?? null;
  if (record.fiscal !== undefined) {
    row.c_trib_nac = record.fiscal.cTribNac ?? null;
    row.c_trib_mun = record.fiscal.cTribMun ?? null;
    row.c_nbs = record.fiscal.cNBS ?? null;
    row.issqn_taxation = record.fiscal.issqnTaxation ?? null;
    row.fiscal_special_tax_regime = record.fiscal.specialTaxRegime ?? null;
    row.location_municipality = record.fiscal.locationMunicipality ?? null;
    row.location_ibge_code = record.fiscal.locationIbgeCode ?? null;
  }
  if (record.competencyDate !== undefined) row.competency_date = record.competencyDate;
  if (record.serviceValue !== undefined) row.service_value = record.serviceValue;
  if (record.serviceDescription !== undefined) row.service_description = record.serviceDescription;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  if (record.status !== undefined) row.status = record.status;
  return row;
}

/**
 * Rascunhos de NFS-e (Parte 1, item 8/9) — independente de contrato/
 * assinatura/financeiro. tomador/fiscal são sempre gravados como
 * snapshot (colunas próprias, nunca lidos via join do cliente/perfil
 * de origem) — ver comentário da tabela na migration.
 */
export function createDraftRepositorySupabase(client: SupabaseClient): DraftRepository {
  return {
    async list(query: DraftListQuery = {}) {
      let builder = client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (query.clientId) builder = builder.eq("client_id", query.clientId);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as DraftRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as DraftRow) : null;
    },

    async create(record) {
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as DraftRow);
    },

    async update(id, changes) {
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as DraftRow);
    },
  };
}
