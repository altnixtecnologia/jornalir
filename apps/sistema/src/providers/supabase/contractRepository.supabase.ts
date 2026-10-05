import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractAmendment, ContractDocument, ContractDocumentExtractedData, ContractDocumentType, ContractStatus, InstitutionalContract } from "@ir/types";
import type { ContractListQuery, ContractRepository, NewContractAmendmentRecord, NewContractDocumentRecord, NewContractRecord, ContractChanges } from "@ir/core";

const TABLE = "institutional_contracts";
const COLUMNS =
  "id, internal_reference, client_id, contract_number, process_number, modality, bidding_reference, object, " +
  "contracted_amount, starts_at, ends_at, status, notes, extra_data, created_at, updated_at";

interface ContractRow {
  id: string;
  internal_reference: string;
  client_id: string;
  contract_number: string | null;
  process_number: string | null;
  modality: string | null;
  bidding_reference: string | null;
  object: string | null;
  contracted_amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  status: ContractStatus;
  notes: string | null;
  extra_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: ContractRow): InstitutionalContract {
  return {
    id: row.id,
    reference: row.internal_reference,
    clientId: row.client_id,
    contractNumber: row.contract_number ?? undefined,
    processNumber: row.process_number ?? undefined,
    modality: row.modality ?? undefined,
    biddingReference: row.bidding_reference ?? undefined,
    object: row.object ?? undefined,
    contractedAmount: row.contracted_amount !== null ? Number(row.contracted_amount) : undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    extraData: row.extra_data ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewContractRecord | ContractChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.clientId !== undefined) row.client_id = record.clientId;
  if (record.contractNumber !== undefined) row.contract_number = record.contractNumber ?? null;
  if (record.processNumber !== undefined) row.process_number = record.processNumber ?? null;
  if (record.modality !== undefined) row.modality = record.modality ?? null;
  if (record.biddingReference !== undefined) row.bidding_reference = record.biddingReference ?? null;
  if (record.object !== undefined) row.object = record.object ?? null;
  if (record.contractedAmount !== undefined) row.contracted_amount = record.contractedAmount ?? null;
  if (record.startsAt !== undefined) row.starts_at = record.startsAt ?? null;
  if (record.endsAt !== undefined) row.ends_at = record.endsAt ?? null;
  if (record.status !== undefined) row.status = record.status;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  if (record.extraData !== undefined) row.extra_data = record.extraData ?? {};
  return row;
}

const DOCUMENT_COLUMNS =
  "id, contract_id, document_type, name, file_reference, document_date, notes, extracted_data, uploaded_by, created_at";

interface DocumentRow {
  id: string;
  contract_id: string;
  document_type: ContractDocumentType;
  name: string;
  file_reference: string | null;
  document_date: string | null;
  notes: string | null;
  extracted_data: ContractDocumentExtractedData | null;
  uploaded_by: string | null;
  created_at: string;
}

function documentToDomain(row: DocumentRow): ContractDocument {
  return {
    id: row.id,
    contractId: row.contract_id,
    documentType: row.document_type,
    name: row.name,
    fileReference: row.file_reference ?? undefined,
    documentDate: row.document_date ?? undefined,
    notes: row.notes ?? undefined,
    extractedData: row.extracted_data ?? undefined,
    uploadedByProfileId: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
  };
}

const AMENDMENT_COLUMNS = "id, contract_id, amount, new_ends_at, document_id, reason, notes, created_by, created_at";

interface AmendmentRow {
  id: string;
  contract_id: string;
  amount: number;
  new_ends_at: string | null;
  document_id: string | null;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

function amendmentToDomain(row: AmendmentRow): ContractAmendment {
  return {
    id: row.id,
    contractId: row.contract_id,
    amount: Number(row.amount),
    newEndsAt: row.new_ends_at ?? undefined,
    documentId: row.document_id ?? undefined,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

export function createContractRepositorySupabase(client: SupabaseClient): ContractRepository {
  return {
    async list(query?: ContractListQuery) {
      let builder = client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (query?.clientId) builder = builder.eq("client_id", query.clientId);
      if (query?.status) builder = builder.eq("status", query.status);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as ContractRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ContractRow) : null;
    },

    async create(record) {
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ContractRow);
    },

    async update(id, changes) {
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ContractRow);
    },

    async listDocuments(contractId) {
      const { data, error } = await client
        .from("contract_documents")
        .select(DOCUMENT_COLUMNS)
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => documentToDomain(row as unknown as DocumentRow));
    },

    async addDocument(record: NewContractDocumentRecord) {
      const { data, error } = await client
        .from("contract_documents")
        .insert({
          contract_id: record.contractId,
          document_type: record.documentType,
          name: record.name,
          file_reference: record.fileReference ?? null,
          document_date: record.documentDate ?? null,
          notes: record.notes ?? null,
          extracted_data: record.extractedData ?? {},
        })
        .select(DOCUMENT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return documentToDomain(data as unknown as DocumentRow);
    },

    async listAmendments(contractId) {
      const { data, error } = await client
        .from("contract_amendments")
        .select(AMENDMENT_COLUMNS)
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => amendmentToDomain(row as unknown as AmendmentRow));
    },

    async addAmendment(record: NewContractAmendmentRecord) {
      const { data, error } = await client
        .from("contract_amendments")
        .insert({
          contract_id: record.contractId,
          amount: record.amount,
          new_ends_at: record.newEndsAt ?? null,
          document_id: record.documentId ?? null,
          reason: record.reason ?? null,
          notes: record.notes ?? null,
        })
        .select(AMENDMENT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return amendmentToDomain(data as unknown as AmendmentRow);
    },
  };
}
