import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientKind, NfseDraft, NfseDraftStatus, NfseIbsCbsSimplesNacionalRegime, NfseSimplesNacionalOption, NfseSpecialTaxRegimeCode } from "@ir/types";
import type { DraftChanges, DraftListQuery, DraftRepository, NewDraftRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "nfse_drafts";
const COLUMNS =
  "id, internal_reference, client_id, " +
  "tomador_kind, tomador_name, tomador_cpf, tomador_cnpj, tomador_municipal_registration, tomador_state_registration, " +
  "tomador_zip, tomador_street, tomador_number, tomador_complement, tomador_neighborhood, tomador_city, tomador_state, " +
  "tomador_ibge_code, tomador_email, tomador_phone, " +
  "service_profile_id, c_trib_nac, c_trib_mun, c_nbs, issqn_taxation, fiscal_special_tax_regime, location_municipality, location_ibge_code, " +
  "fiscal_c_atv_sn, fiscal_cst_ibs_cbs, fiscal_c_class_trib, fiscal_c_ind_op, " +
  "fiscal_issuer_simples_nacional_option, fiscal_issuer_ibs_cbs_simples_nacional_regime, fiscal_issuer_special_tax_regime_code, " +
  "competency_date, service_value, service_description, notes, status, " +
  "origin_system, origin_type, origin_record_id, commercial_sale_id, " +
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
  fiscal_c_atv_sn: string | null;
  fiscal_cst_ibs_cbs: string | null;
  fiscal_c_class_trib: string | null;
  fiscal_c_ind_op: string | null;
  fiscal_issuer_simples_nacional_option: string | null;
  fiscal_issuer_ibs_cbs_simples_nacional_regime: string | null;
  fiscal_issuer_special_tax_regime_code: string | null;
  competency_date: string;
  service_value: number;
  service_description: string;
  notes: string | null;
  status: NfseDraftStatus;
  origin_system: string | null;
  origin_type: string | null;
  origin_record_id: string | null;
  commercial_sale_id: string | null;
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
      cAtvSN: row.fiscal_c_atv_sn ?? undefined,
      cstIbsCbs: row.fiscal_cst_ibs_cbs ?? undefined,
      cClassTrib: row.fiscal_c_class_trib ?? undefined,
      cIndOp: row.fiscal_c_ind_op ?? undefined,
      issuerSimplesNacionalOption: (row.fiscal_issuer_simples_nacional_option as NfseSimplesNacionalOption | null) ?? undefined,
      issuerIbsCbsSimplesNacionalRegime:
        (row.fiscal_issuer_ibs_cbs_simples_nacional_regime as NfseIbsCbsSimplesNacionalRegime | null) ?? undefined,
      issuerSpecialTaxRegimeCode: (row.fiscal_issuer_special_tax_regime_code as NfseSpecialTaxRegimeCode | null) ?? undefined,
    },
    competencyDate: row.competency_date,
    serviceValue: Number(row.service_value),
    serviceDescription: row.service_description,
    notes: row.notes ?? undefined,
    status: row.status,
    originSystem: row.origin_system ?? undefined,
    originType: row.origin_type ?? undefined,
    originRecordId: row.origin_record_id ?? undefined,
    commercialSaleId: row.commercial_sale_id ?? undefined,
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
    row.fiscal_c_atv_sn = record.fiscal.cAtvSN ?? null;
    row.fiscal_cst_ibs_cbs = record.fiscal.cstIbsCbs ?? null;
    row.fiscal_c_class_trib = record.fiscal.cClassTrib ?? null;
    row.fiscal_c_ind_op = record.fiscal.cIndOp ?? null;
    row.fiscal_issuer_simples_nacional_option = record.fiscal.issuerSimplesNacionalOption ?? null;
    row.fiscal_issuer_ibs_cbs_simples_nacional_regime = record.fiscal.issuerIbsCbsSimplesNacionalRegime ?? null;
    row.fiscal_issuer_special_tax_regime_code = record.fiscal.issuerSpecialTaxRegimeCode ?? null;
  }
  if (record.competencyDate !== undefined) row.competency_date = record.competencyDate;
  if (record.serviceValue !== undefined) row.service_value = record.serviceValue;
  if (record.serviceDescription !== undefined) row.service_description = record.serviceDescription;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  if (record.status !== undefined) row.status = record.status;
  if (record.originSystem !== undefined) row.origin_system = record.originSystem ?? null;
  if (record.originType !== undefined) row.origin_type = record.originType ?? null;
  if (record.originRecordId !== undefined) row.origin_record_id = record.originRecordId ?? null;
  if (record.commercialSaleId !== undefined) row.commercial_sale_id = record.commercialSaleId ?? null;
  return row;
}

// Rascunhos demonstrativos (preview) — em memória só pela duração do
// processo, mesmo princípio dos demais módulos em SYSTEM_LOCAL_PREVIEW=1.
// preview-rascunho-1 (PF): editável, sem tentativa ainda.
// preview-rascunho-2 (PJ): tem uma tentativa REJEITADA (ver
// PREVIEW_TRANSMISSION_ATTEMPTS em nfseTransmissionAttemptRepository.supabase.ts).
// preview-rascunho-3 (PF): tem uma NOTA EMITIDA (ver
// nfseIssuedNoteRepository.supabase.ts) — demonstra o fluxo autorizado.
export const PREVIEW_DRAFTS: NfseDraft[] = [
  {
    id: "preview-rascunho-1",
    reference: "IR-NFSE-2026-000001",
    clientId: "preview-cliente-1",
    tomador: {
      sourceClientId: "preview-cliente-1",
      kind: "individual",
      name: "Cliente de Exemplo (visualização local)",
      cpf: "11122233396",
      city: "São João do Sul",
      state: "SC",
      ibgeCode: "4216404",
      email: "preview@example.invalid",
    },
    serviceProfileId: "preview-perfil-servico-1",
    fiscal: { sourceServiceProfileId: "preview-perfil-servico-1", cTribNac: "140619", cTribMun: "706", cNBS: "1.1406.19.00", locationMunicipality: "São João do Sul", locationIbgeCode: "4216404" },
    competencyDate: "2026-10-01",
    serviceValue: 150,
    serviceDescription: "Divulgação institucional — demonstração (preview).",
    status: "draft",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-rascunho-2",
    reference: "IR-NFSE-2026-000002",
    clientId: "preview-cliente-2",
    tomador: {
      sourceClientId: "preview-cliente-2",
      kind: "company",
      name: "Empresa de Exemplo Ltda. (visualização local)",
      cnpj: "11222333000181",
      city: "São João do Sul",
      state: "SC",
      ibgeCode: "4216404",
      email: "empresa-preview@example.invalid",
    },
    serviceProfileId: "preview-perfil-servico-1",
    fiscal: { sourceServiceProfileId: "preview-perfil-servico-1", cTribNac: "140619", cTribMun: "706", cNBS: "1.1406.19.00" },
    competencyDate: "2026-10-01",
    serviceValue: 300,
    serviceDescription: "Publicidade institucional — demonstração de rejeição (preview).",
    status: "draft",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-rascunho-3",
    reference: "IR-NFSE-2026-000003",
    clientId: "preview-cliente-1",
    tomador: {
      sourceClientId: "preview-cliente-1",
      kind: "individual",
      name: "Cliente de Exemplo (visualização local)",
      cpf: "11122233396",
      city: "São João do Sul",
      state: "SC",
      ibgeCode: "4216404",
      email: "preview@example.invalid",
    },
    serviceProfileId: "preview-perfil-servico-1",
    fiscal: { sourceServiceProfileId: "preview-perfil-servico-1", cTribNac: "140619", cTribMun: "706", cNBS: "1.1406.19.00" },
    competencyDate: "2026-09-01",
    serviceValue: 220,
    serviceDescription: "Divulgação institucional — demonstração de autorização (preview).",
    status: "draft",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

/**
 * Rascunhos de NFS-e (Parte 1, item 8/9) — independente de contrato/
 * assinatura/financeiro. tomador/fiscal são sempre gravados como
 * snapshot (colunas próprias, nunca lidos via join do cliente/perfil
 * de origem) — ver comentário da tabela na migration.
 */
export function createDraftRepositorySupabase(client: SupabaseClient): DraftRepository {
  return {
    async list(query: DraftListQuery = {}) {
      if (isLocalPreviewEnabled()) return query.clientId ? PREVIEW_DRAFTS.filter((d) => d.clientId === query.clientId) : PREVIEW_DRAFTS;
      let builder = client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (query.clientId) builder = builder.eq("client_id", query.clientId);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as DraftRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_DRAFTS.find((d) => d.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as DraftRow) : null;
    },

    async findByOrigin(originSystem, originType, originRecordId) {
      if (isLocalPreviewEnabled()) {
        return (
          PREVIEW_DRAFTS.find((d) => d.originSystem === originSystem && d.originType === originType && d.originRecordId === originRecordId) ?? null
        );
      }
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .eq("origin_system", originSystem)
        .eq("origin_type", originType)
        .eq("origin_record_id", originRecordId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as DraftRow) : null;
    },

    async create(record) {
      if (isLocalPreviewEnabled()) {
        const draft: NfseDraft = {
          ...record,
          id: `preview-rascunho-${Date.now()}`,
          reference: `IR-NFSE-PREVIEW-${PREVIEW_DRAFTS.length + 1}`,
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        PREVIEW_DRAFTS.push(draft);
        return draft;
      }
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) {
        if (error.message.includes("nfse_drafts_origin_unique")) throw new Error("nfse_drafts_origin_unique");
        throw new Error(error.message);
      }
      return toDomain(data as unknown as DraftRow);
    },

    async update(id, changes) {
      if (isLocalPreviewEnabled()) {
        const index = PREVIEW_DRAFTS.findIndex((d) => d.id === id);
        if (index === -1) throw new Error(`Rascunho não encontrado: ${id}`);
        PREVIEW_DRAFTS[index] = { ...PREVIEW_DRAFTS[index], ...changes, updatedAt: new Date().toISOString() };
        return PREVIEW_DRAFTS[index];
      }
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as DraftRow);
    },
  };
}
