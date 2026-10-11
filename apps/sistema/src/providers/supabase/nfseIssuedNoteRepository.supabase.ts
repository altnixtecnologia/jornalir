import type { SupabaseClient } from "@supabase/supabase-js";
import type { NfseEnvironment, NfseIssuedNote } from "@ir/types";
import { buildDpsId } from "@ir/types";
import type { IssuedNoteRepository, NewIssuedNoteRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

// Nota emitida demonstrativa (preview) — corresponde ao rascunho
// preview-rascunho-3 (PF, ver nfseDraftRepository.supabase.ts/
// PREVIEW_DRAFTS). Todos os campos existem de verdade no tipo
// NfseIssuedNote; nenhuma coluna inventada. accessKey/nfseNumber/dpsId são
// claramente fictícios (nunca um identificador real do Sistema Nacional).
// Mutável (array, não const de objeto) — "Emitir NFS-e (demonstração)"
// (ver NfseTransmissionPanel) acrescenta uma nova linha aqui ao simular
// autorização de outro rascunho.
export const PREVIEW_ISSUED_NOTES: NfseIssuedNote[] = [
  {
    id: "preview-nota-1",
    draftId: "preview-rascunho-3",
    issuerConfigId: "preview-issuer-config-1",
    clientId: "preview-cliente-1",
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber: 1,
    dpsId: buildDpsId({ ibgeCode: "4216404", federalInscriptionType: "cpf", federalInscription: "11122233396", series: "1", number: 1 }),
    accessKey: "42264091122233396100100000000000000000000001",
    nfseNumber: "1",
    issuedAt: "2026-09-10T14:32:00.000Z",
    competencyDate: "2026-09-01",
    serviceValue: 220,
    signedDpsXml:
      '<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="PREVIEW-DEMO-ONLY">...(assinatura e corpo reais omitidos — este é um XML de demonstração, nunca transmitido)...</infDPS></DPS>',
    createdAt: new Date(0).toISOString(),
  },
];

const TABLE = "nfse_issued_notes";
const COLUMNS =
  "id, draft_id, issuer_config_id, client_id, environment, dps_series, dps_number, dps_id, access_key, nfse_number, " +
  "issued_at, competency_date, service_value, signed_dps_xml, nfse_xml, created_by, created_at";

interface IssuedNoteRow {
  id: string;
  draft_id: string;
  issuer_config_id: string;
  client_id: string;
  environment: NfseEnvironment;
  dps_series: string;
  dps_number: number;
  dps_id: string;
  access_key: string | null;
  nfse_number: string | null;
  issued_at: string | null;
  competency_date: string;
  service_value: number;
  signed_dps_xml: string;
  nfse_xml: string | null;
  created_by: string | null;
  created_at: string;
}

function toDomain(row: IssuedNoteRow): NfseIssuedNote {
  return {
    id: row.id,
    draftId: row.draft_id,
    issuerConfigId: row.issuer_config_id,
    clientId: row.client_id,
    environment: row.environment,
    dpsSeries: row.dps_series,
    dpsNumber: Number(row.dps_number),
    dpsId: row.dps_id,
    accessKey: row.access_key ?? undefined,
    nfseNumber: row.nfse_number ?? undefined,
    issuedAt: row.issued_at ?? undefined,
    competencyDate: row.competency_date,
    serviceValue: Number(row.service_value),
    signedDpsXml: row.signed_dps_xml,
    nfseXml: row.nfse_xml ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

/** NFS-e autorizada (Parte 2A, item 10) — nunca update/delete; a
 * constraint UNIQUE em draft_id é a proteção real de idempotência. */
export function createIssuedNoteRepositorySupabase(client: SupabaseClient): IssuedNoteRepository {
  return {
    async listAll() {
      if (isLocalPreviewEnabled()) return PREVIEW_ISSUED_NOTES;
      const { data, error } = await client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as IssuedNoteRow));
    },

    async getByDraftId(draftId) {
      if (isLocalPreviewEnabled()) return PREVIEW_ISSUED_NOTES.find((n) => n.draftId === draftId) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("draft_id", draftId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as IssuedNoteRow) : null;
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_ISSUED_NOTES.find((n) => n.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as IssuedNoteRow) : null;
    },

    async create(record: NewIssuedNoteRecord) {
      if (isLocalPreviewEnabled()) {
        const note: NfseIssuedNote = { ...record, id: `preview-nota-${Date.now()}`, createdAt: new Date().toISOString() };
        PREVIEW_ISSUED_NOTES.push(note);
        return note;
      }
      const { data, error } = await client
        .from(TABLE)
        .insert({
          draft_id: record.draftId,
          issuer_config_id: record.issuerConfigId,
          client_id: record.clientId,
          environment: record.environment,
          dps_series: record.dpsSeries,
          dps_number: record.dpsNumber,
          dps_id: record.dpsId,
          access_key: record.accessKey ?? null,
          nfse_number: record.nfseNumber ?? null,
          issued_at: record.issuedAt ?? null,
          competency_date: record.competencyDate,
          service_value: record.serviceValue,
          signed_dps_xml: record.signedDpsXml,
          nfse_xml: record.nfseXml ?? null,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as IssuedNoteRow);
    },
  };
}
