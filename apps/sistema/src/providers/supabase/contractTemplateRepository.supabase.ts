import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContractTemplate,
  ContractTemplateDocumentMode,
  ContractTemplateModality,
  ContractTemplateVariable,
} from "@ir/types";
import type { ContractTemplateRepository, NewContractTemplateVersionRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "contract_templates";
const COLUMNS =
  "id, group_id, version, title, description, category, content, variables, active, test_enabled, modality, specific_for, legal_approved_at, legal_approved_by, legal_approval_note, legal_approval_evidence, legal_approval_content_sha256, document_mode, attachment_sha256, attachment_bytes, attachment_note, created_by, created_at";

interface TemplateRow {
  id: string;
  group_id: string;
  version: number;
  title: string;
  description: string | null;
  category: string | null;
  content: string;
  variables: ContractTemplateVariable[];
  active: boolean;
  test_enabled: boolean;
  modality: ContractTemplateModality | null;
  specific_for: string | null;
  legal_approved_at: string | null;
  legal_approved_by: string | null;
  legal_approval_note: string | null;
  legal_approval_evidence: string | null;
  legal_approval_content_sha256: string | null;
  document_mode: ContractTemplateDocumentMode;
  attachment_sha256: string | null;
  attachment_bytes: number | null;
  attachment_note: string | null;
  created_by: string | null;
  created_at: string;
}

function toDomain(row: TemplateRow): ContractTemplate {
  return {
    id: row.id,
    groupId: row.group_id,
    version: row.version,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    content: row.content,
    variables: row.variables ?? [],
    active: row.active,
    testEnabled: row.test_enabled === true,
    modality: row.modality ?? undefined,
    specificFor: row.specific_for ?? undefined,
    legalApproval:
      row.legal_approved_at && row.legal_approved_by && row.legal_approval_note && row.legal_approval_evidence && row.legal_approval_content_sha256
        ? {
            approvedAt: row.legal_approved_at,
            approvedByProfileId: row.legal_approved_by,
            note: row.legal_approval_note,
            evidence: row.legal_approval_evidence,
            contentSha256: row.legal_approval_content_sha256,
          }
        : undefined,
    documentMode: row.document_mode ?? "text",
    attachment:
      row.attachment_sha256 && row.attachment_bytes
        ? { sha256: row.attachment_sha256, bytes: row.attachment_bytes, note: row.attachment_note ?? undefined }
        : undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

function toInsertRow(record: NewContractTemplateVersionRecord) {
  return {
    title: record.title,
    description: record.description ?? null,
    category: record.category ?? null,
    content: record.content,
    variables: record.variables,
    modality: record.modality ?? null,
    specific_for: record.specificFor ?? null,
    document_mode: record.documentMode,
    attachment_path: record.attachment?.path ?? null,
    attachment_sha256: record.attachment?.sha256 ?? null,
    attachment_bytes: record.attachment?.bytes ?? null,
    attachment_note: record.attachment?.note ?? null,
    // active/test_enabled/aprovação nunca são enviados: o banco força o estado
    // seguro em todo INSERT (trigger contract_templates_force_safe_insert).
  };
}

/** Modelos de contrato — nenhuma linha já criada tem o CONTEÚDO alterado (trigger no banco); `active`, `test_enabled` e a aprovação jurídica mudam só por RPC própria e auditada. */
export function createContractTemplateRepositorySupabase(client: SupabaseClient): ContractTemplateRepository {
  async function rpc(name: string, args: Record<string, unknown>): Promise<ContractTemplate> {
    const { data, error } = await client.rpc(name, args).single();
    if (error) throw new Error(error.message);
    // As RPCs devolvem a linha completa da tabela (inclui attachment_path, que não vai ao domínio).
    return toDomain(data as unknown as TemplateRow);
  }

  return {
    async listCurrentVersions() {
      if (isLocalPreviewEnabled()) return [];
      // Maior version por group_id — feito em memória (volume baixo, nunca milhares de modelos) em vez de SQL avançado, mesmo princípio de simplicidade dos demais repositórios deste projeto.
      const { data, error } = await client.from(TABLE).select(COLUMNS).order("group_id").order("version", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as TemplateRow[];
      const byGroup = new Map<string, TemplateRow>();
      for (const row of rows) if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, row);
      return [...byGroup.values()].map(toDomain);
    },

    async getById(id: string) {
      if (isLocalPreviewEnabled()) return null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as TemplateRow) : null;
    },

    async listVersionsByGroup(groupId: string) {
      if (isLocalPreviewEnabled()) return [];
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("group_id", groupId).order("version", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as TemplateRow[]).map(toDomain);
    },

    async getLatestVersionByGroup(groupId: string) {
      if (isLocalPreviewEnabled()) return null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("group_id", groupId)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as TemplateRow) : null;
    },

    async createFirstVersion(record: NewContractTemplateVersionRecord) {
      // group_id é NOT NULL sem default — a 1a versão de um grupo novo
      // precisa do id gerado ANTES do insert, pra group_id apontar pra
      // si mesma na mesma linha (nunca um update de correção depois).
      const id = crypto.randomUUID();
      const { data, error } = await client.from(TABLE).insert({ id, group_id: id, version: 1, ...toInsertRow(record) })
        .select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as TemplateRow);
    },

    async createNextVersion(groupId: string, record: NewContractTemplateVersionRecord) {
      const { data: latest, error: latestError } = await client.from(TABLE).select("version").eq("group_id", groupId)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw new Error(latestError.message);
      const nextVersion = (latest?.version ?? 0) + 1;
      const { data, error } = await client.from(TABLE).insert({ ...toInsertRow(record), group_id: groupId, version: nextVersion })
        .select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as TemplateRow);
    },

    setActive: (id, active) => rpc("set_contract_template_active", { p_template_id: id, p_active: active }),
    setTestMode: (id, enabled) => rpc("set_contract_template_test_mode", { p_template_id: id, p_enabled: enabled }),
    recordLegalApproval: (id, note, evidence) =>
      rpc("record_contract_template_legal_approval", { p_template_id: id, p_note: note, p_evidence: evidence }),
    revokeLegalApproval: (id, reason) => rpc("revoke_contract_template_legal_approval", { p_template_id: id, p_reason: reason }),

    async getAttachmentPath(id: string) {
      if (isLocalPreviewEnabled()) return null;
      const { data, error } = await client.from(TABLE).select("attachment_path").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.attachment_path as string | null | undefined) ?? null;
    },
  };
}
