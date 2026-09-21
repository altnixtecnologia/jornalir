import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditorialSection } from "@ir/types";
import type {
  EditorialSectionChanges,
  EditorialSectionRepository,
  NewEditorialSectionRecord,
} from "@ir/core";

const COLUMNS = "id, name, slug, active, sort_order";
const TABLE = "editorial_sections";

interface EditorialSectionRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sort_order: number;
}

/**
 * `EditorialSection.order` (domínio) ↔ `sort_order` (coluna real). A única
 * conversão de formato fica aqui — a UI nunca vê `sort_order`.
 *
 * `EditorialSection.description` não tem coluna correspondente em
 * `public.editorial_sections` (schema aplicado na Fase 17, sem esse
 * campo). Em vez de mudar o schema "porque o tipo pede" (instrução
 * explícita da Fase 24: não mudar schema sem necessidade clara), este
 * provider real simplesmente não persiste `description` — `list`/
 * `getById` sempre devolvem `description: undefined` para dados reais, e
 * `create`/`update` ignoram esse campo quando presente no input. Ver
 * docs/DATABASE-IR-CORE.md (Fase 24) para o registro completo desta
 * divergência.
 */
function toDomain(row: EditorialSectionRow): EditorialSection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
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
      if (changes.active !== undefined) patch.active = changes.active;
      if (changes.order !== undefined) patch.sort_order = changes.order;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as EditorialSectionRow);
    },
  };
}
