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
      storage_provider: "r2",
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


export interface MediaAdminPageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface MediaAdminPageResult {
  assets: MediaAsset[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function mediaPageSize(value?: number): number {
  return value === 24 || value === 96 ? value : 48;
}

function cleanMediaSearch(value?: string): string {
  return (value ?? "").trim().replace(/[%_,]/g, " ");
}

export async function listMediaAdminPageSupabase(
  client: SupabaseClient,
  input: MediaAdminPageQuery = {},
): Promise<MediaAdminPageResult> {
  const pageSize = mediaPageSize(input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));

  const build = (page: number) => {
    let query = client
      .from(TABLE)
      .select(COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    const term = cleanMediaSearch(input.search);
    if (term) {
      const pattern = `%${term}%`;
      query = query.or(
        `title.ilike.${pattern},internal_reference.ilike.${pattern},caption.ilike.${pattern},credit.ilike.${pattern}`,
      );
    }

    const from = (page - 1) * pageSize;
    return query.range(from, from + pageSize - 1);
  };

  let { data, error, count } = await build(requestedPage);
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) {
    const retry = await build(page);
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  return {
    assets: (data ?? []).map((row) => toDomain(row as MediaAssetRow)),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function listRecentMediaAssetsSupabase(
  client: SupabaseClient,
  limit = 60,
): Promise<MediaAsset[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const { data, error } = await client
    .from(TABLE)
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toDomain(row as MediaAssetRow));
}

export async function searchMediaAssetsSupabase(
  client: SupabaseClient,
  search: string,
  limit = 60,
): Promise<MediaAsset[]> {
  const term = cleanMediaSearch(search);
  if (!term) return listRecentMediaAssetsSupabase(client, limit);

  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const pattern = `%${term}%`;
  const { data, error } = await client
    .from(TABLE)
    .select(COLUMNS)
    .or(
      `title.ilike.${pattern},internal_reference.ilike.${pattern},caption.ilike.${pattern},credit.ilike.${pattern}`,
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toDomain(row as MediaAssetRow));
}

export async function getMediaAssetsByIdsSupabase(
  client: SupabaseClient,
  ids: string[],
): Promise<MediaAsset[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const { data, error } = await client.from(TABLE).select(COLUMNS).in("id", uniqueIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toDomain(row as MediaAssetRow));
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
