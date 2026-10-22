import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locality } from "@ir/types";
import type { LocalityChanges, LocalityRepository, NewLocalityRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const PREVIEW_LOCALITIES: Locality[] = [
  { id: "preview-sjs", slug: "sao-joao-do-sul", name: "São João do Sul", scope: "city", stateCode: "SC", active: true },
  { id: "preview-sc", slug: "santa-catarina", name: "Santa Catarina", scope: "state", stateCode: "SC", active: true },
];

const COLUMNS = "id, name, slug, scope, state_code, active";
const TABLE = "localities";

interface LocalityRow {
  id: string;
  name: string;
  slug: string;
  scope: Locality["scope"];
  state_code: string | null;
  active: boolean;
}

/** `parent_id` e `sort_order` ficam fora deste cadastro editorial. A UF
 * `state_code` pertence à localidade e orientará a entrega geográfica. */
function toDomain(row: LocalityRow): Locality {
  return { id: row.id, name: row.name, slug: row.slug, scope: row.scope, stateCode: row.state_code, active: row.active };
}

export function createLocalityRepositorySupabase(client: SupabaseClient): LocalityRepository {
  return {
    async list() {
      if (isLocalPreviewEnabled()) return PREVIEW_LOCALITIES;
      const { data, error } = await client.from(TABLE).select(COLUMNS).order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as LocalityRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_LOCALITIES.find((locality) => locality.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as LocalityRow) : null;
    },

    async create(record: NewLocalityRecord) {
      const { data, error } = await client
        .from(TABLE)
        .insert({ name: record.name, slug: record.slug, scope: record.scope, state_code: record.stateCode ?? null, active: record.active })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as LocalityRow);
    },

    async update(id, changes: LocalityChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.name !== undefined) patch.name = changes.name;
      if (changes.slug !== undefined) patch.slug = changes.slug;
      if (changes.scope !== undefined) patch.scope = changes.scope;
      if (changes.stateCode !== undefined) patch.state_code = changes.stateCode;
      if (changes.active !== undefined) patch.active = changes.active;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as LocalityRow);
    },
  };
}
