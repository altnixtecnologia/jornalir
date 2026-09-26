import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleExternalSource } from "@ir/types";
import type {
  ArticleExternalSourceChanges,
  ArticleExternalSourceRepository,
  NewArticleExternalSourceRecord,
} from "@ir/core";

const TABLE = "article_external_sources";
const COLUMNS =
  "id, article_id, provider, external_id, source_url, source_slug, original_category, original_subcategory, original_author, original_published_at, original_updated_at, imported_at, last_synced_at, source_hash, raw_metadata, created_at, updated_at";

interface Row {
  id: string;
  article_id: string;
  provider: string;
  external_id: string | null;
  source_url: string | null;
  source_slug: string | null;
  original_category: string | null;
  original_subcategory: string | null;
  original_author: string | null;
  original_published_at: string | null;
  original_updated_at: string | null;
  imported_at: string;
  last_synced_at: string | null;
  source_hash: string | null;
  raw_metadata: unknown;
  created_at: string;
  updated_at: string;
}

function toDomain(row: Row): ArticleExternalSource {
  return {
    id: row.id,
    articleId: row.article_id,
    provider: row.provider,
    externalId: row.external_id ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    sourceSlug: row.source_slug ?? undefined,
    originalCategory: row.original_category ?? undefined,
    originalSubcategory: row.original_subcategory ?? undefined,
    originalAuthor: row.original_author ?? undefined,
    originalPublishedAt: row.original_published_at ?? undefined,
    originalUpdatedAt: row.original_updated_at ?? undefined,
    importedAt: row.imported_at,
    lastSyncedAt: row.last_synced_at ?? undefined,
    sourceHash: row.source_hash ?? undefined,
    rawMetadata: row.raw_metadata ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Provider da rastreabilidade de conteúdo importado (Fase 33 —
 * preparação; ainda sem importador real usando isto). `findByProviderAndIdentifier`
 * é a checagem de duplicidade (item 4/11) — sempre antes de `create`.
 */
export function createArticleExternalSourceRepositorySupabase(
  client: SupabaseClient,
): ArticleExternalSourceRepository {
  return {
    async getByArticleId(articleId) {
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .eq("article_id", articleId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as Row) : null;
    },

    async findByProviderAndIdentifier(provider, identifier) {
      if (identifier.externalId) {
        const { data, error } = await client
          .from(TABLE)
          .select(COLUMNS)
          .eq("provider", provider)
          .eq("external_id", identifier.externalId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) return toDomain(data as Row);
      }
      if (identifier.sourceUrl) {
        const { data, error } = await client
          .from(TABLE)
          .select(COLUMNS)
          .eq("provider", provider)
          .eq("source_url", identifier.sourceUrl)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) return toDomain(data as Row);
      }
      return null;
    },

    async create(record: NewArticleExternalSourceRecord) {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          article_id: record.articleId,
          provider: record.provider,
          external_id: record.externalId ?? null,
          source_url: record.sourceUrl ?? null,
          source_slug: record.sourceSlug ?? null,
          original_category: record.originalCategory ?? null,
          original_subcategory: record.originalSubcategory ?? null,
          original_author: record.originalAuthor ?? null,
          original_published_at: record.originalPublishedAt ?? null,
          original_updated_at: record.originalUpdatedAt ?? null,
          last_synced_at: record.lastSyncedAt ?? null,
          source_hash: record.sourceHash ?? null,
          raw_metadata: record.rawMetadata ?? null,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as Row);
    },

    async update(id, changes: ArticleExternalSourceChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.lastSyncedAt !== undefined) patch.last_synced_at = changes.lastSyncedAt ?? null;
      if (changes.sourceHash !== undefined) patch.source_hash = changes.sourceHash ?? null;
      if (changes.rawMetadata !== undefined) patch.raw_metadata = changes.rawMetadata ?? null;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as Row);
    },
  };
}
