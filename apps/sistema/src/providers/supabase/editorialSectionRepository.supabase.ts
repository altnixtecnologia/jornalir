import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditorialSection } from "@ir/types";
import type {
  EditorialSectionChanges,
  EditorialSectionRepository,
  NewEditorialSectionRecord,
} from "@ir/core";

const COLUMNS = "id, name, slug, description, active, sort_order";
const TABLE = "editorial_sections";

interface EditorialSectionRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  sort_order: number;
}

/**
 * `EditorialSection.order` (domínio) ↔ `sort_order` (coluna real). A única
 * conversão de formato fica aqui — a UI nunca vê `sort_order`.
 *
 * `description` ganhou coluna real na Fase 25 (migration
 * `20260925100000_articles_real_provider.sql`) — a Fase 24 descartava esse
 * campo silenciosamente por falta de coluna, mas ele é editável de verdade
 * na tela de Editorias desde a Fase 16; ver docs/DATABASE-IR-CORE.md.
 */
function toDomain(row: EditorialSectionRow): EditorialSection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    active: row.active,
    order: row.sort_order,
  };
}

export function createEditorialSectionRepositorySupabase(
  client: SupabaseClient,
): EditorialSectionRepository {
  return {
    async list() {
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as EditorialSectionRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as EditorialSectionRow) : null;
    },

    async create(record: NewEditorialSectionRecord) {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          name: record.name,
          slug: record.slug,
          description: record.description ?? null,
          active: record.active,
          sort_order: record.order ?? 0,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as EditorialSectionRow);
    },

    async update(id, changes: EditorialSectionChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.name !== undefined) patch.name = changes.name;
      if (changes.slug !== undefined) patch.slug = changes.slug;
      if (changes.description !== undefined) patch.description = changes.description ?? null;
      if (changes.active !== undefined) patch.active = changes.active;
      if (changes.order !== undefined) patch.sort_order = changes.order;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as EditorialSectionRow);
    },
  };
}
