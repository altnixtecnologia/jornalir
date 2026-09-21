import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaAsset } from "@ir/types";
import type { MediaAssetChanges, MediaAssetRepository, NewMediaAssetRecord } from "@ir/core";

const TABLE = "media_assets";
const COLUMNS =
  "id, internal_reference, title, public_url, alt_text, caption, credit, captured_at, width, height, created_at";

interface MediaAssetRow {
  id: string;
  internal_reference: string;
  title: string;
  public_url: string | null;
  alt_text: string | null;
  caption: string | null;
  credit: string | null;
  captured_at: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

/** `MediaAsset.name` (domínio) ↔ `title` (coluna real); `url` ↔ `public_url`. */
function toDomain(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    reference: row.internal_reference,
    name: row.title,
    url: row.public_url ?? "",
    altText: row.alt_text ?? undefined,
    caption: row.caption ?? undefined,
    credit: row.credit ?? undefined,
    capturedAt: row.captured_at ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    createdAt: row.created_at,
  };
}

export interface UploadedMediaAssetInput {
  title: string;
  storagePath: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/**
 * Cadastro específico de mídia enviada via upload real (Storage) —
 * complementa `create()` (que só cataloga uma URL já hospedada, contrato
 * compartilhado com o mock) gravando também `storage_path`/`mime_type`/
 * `file_name`, que não fazem parte do domínio `MediaAsset` (detalhe de
 * implementação do provider real, nunca vaza para a UI).
 */
export async function registerUploadedMediaAsset(
  client: SupabaseClient,
  input: UploadedMediaAssetInput,
): Promise<MediaAsset> {
  const { data, error } = await client
    .from(TABLE)
    .insert({
      title: input.title,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      file_name: input.fileName,
      mime_type: input.mimeType,
      width: input.width ?? null,
      height: input.height ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toDomain(data as MediaAssetRow);
}

export function createMediaAssetRepositorySupabase(client: SupabaseClient): MediaAssetRepository {
  return {
    async list() {
      const { data, error } = await client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as MediaAssetRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as MediaAssetRow) : null;
    },

    async create(record: NewMediaAssetRecord) {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          title: record.name,
          public_url: record.url,
          alt_text: record.altText ?? null,
          caption: record.caption ?? null,
          credit: record.credit ?? null,
          captured_at: record.capturedAt ?? null,
          width: record.width ?? null,
          height: record.height ?? null,
          // created_by: nunca enviado do cliente — trigger `set_media_asset_actor`
          // (Fase 26) sempre usa auth.uid() da sessão.
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(data as MediaAssetRow);
    },

    async update(id, changes: MediaAssetChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.name !== undefined) patch.title = changes.name;
      if (changes.url !== undefined) patch.public_url = changes.url;
      if (changes.altText !== undefined) patch.alt_text = changes.altText ?? null;
      if (changes.caption !== undefined) patch.caption = changes.caption ?? null;
      if (changes.credit !== undefined) patch.credit = changes.credit ?? null;
      if (changes.capturedAt !== undefined) patch.captured_at = changes.capturedAt ?? null;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as MediaAssetRow);
    },
  };
}
