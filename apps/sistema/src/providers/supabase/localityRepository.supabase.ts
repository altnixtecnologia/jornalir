import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locality } from "@ir/types";
import type { LocalityChanges, LocalityRepository, NewLocalityRecord } from "@ir/core";

const COLUMNS = "id, name, slug, scope, active";
const TABLE = "localities";

interface LocalityRow {
  id: string;
  name: string;
  slug: string;
  scope: Locality["scope"];
  active: boolean;
}

/**
 * `public.localities` também tem `parent_id`/`sort_order` (schema da Fase
 * 17), sem equivalente no tipo `Locality` do domínio — não selecionados
 * aqui, então nunca aparecem na UI. Nenhuma mudança de schema necessária:
 * o domínio simplesmente ainda não usa esses dois campos.
 */
function toDomain(row: LocalityRow): Locality {
  return { id: row.id, name: row.name, slug: row.slug, scope: row.scope, active: row.active };
}

export function createLocalityRepositorySupabase(client: SupabaseClient): LocalityRepository {
  return {
    async list() {
      const { data, error } = await client.from(TABLE).select(COLUMNS).order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as LocalityRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as LocalityRow) : null;
    },

    async create(record: NewLocalityRecord) {
      const { data, error } = await client
        .from(TABLE)
        .insert({ name: record.name, slug: record.slug, scope: record.scope, active: record.active })
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
      if (changes.active !== undefined) patch.active = changes.active;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as LocalityRow);
    },
  };
}
