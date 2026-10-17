import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractTemplate, ContractTemplateVariable } from "@ir/types";
import type { ContractTemplateRepository, NewContractTemplateVersionRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "contract_templates";
const COLUMNS = "id, group_id, version, title, description, category, content, variables, active, created_by, created_at";

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
  };
}

/** Modelos de contrato (Item 5, Lote 3) — nenhuma linha já criada é atualizada depois (exceto `active`, via RPC própria). */
export function createContractTemplateRepositorySupabase(client: SupabaseClient): ContractTemplateRepository {
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

    async setActive(id: string, active: boolean) {
      const { data, error } = await client.rpc("set_contract_template_active", { p_template_id: id, p_active: active }).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as TemplateRow);
    },
  };
}
