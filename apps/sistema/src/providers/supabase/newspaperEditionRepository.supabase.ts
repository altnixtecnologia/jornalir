import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewspaperEdition } from "@ir/types";
import type { NewspaperEditionChanges, NewspaperEditionRepository, NewNewspaperEditionRecord } from "@ir/core";
import { signEditionPdfUrl } from "./editionPdfStorage.supabase";

const TABLE = "newspaper_editions";
const COLUMNS =
  "id, edition_number, publication_date, title, pdf_url, pdf_storage_path, page_count, active, created_at";

interface NewspaperEditionRow {
  id: string;
  edition_number: number;
  publication_date: string;
  title: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  page_count: number | null;
  active: boolean;
  created_at: string;
}

/**
 * `NewspaperEdition.reference` (domínio, ex.: "ED-2026-038") não tem coluna
 * própria — gerado aqui a partir do ano da `publication_date` +
 * `edition_number` (o campo real e próprio do número, item 3 da Fase 28).
 *
 * `pdfUrl`: quando o PDF foi enviado por upload (`pdf_storage_path`
 * preenchido, bucket privado), uma URL assinada é gerada na hora — nunca
 * fica guardada/expirada no banco. Sem upload, cai para `pdf_url` (uma URL
 * externa já hospedada, colada manualmente).
 */
async function toDomain(client: SupabaseClient, row: NewspaperEditionRow): Promise<NewspaperEdition> {
  const pdfUrl = row.pdf_storage_path
    ? await signEditionPdfUrl(client, row.pdf_storage_path)
    : row.pdf_url ?? undefined;
  const year = row.publication_date.slice(0, 4);
  return {
    id: row.id,
    editionNumber: row.edition_number,
    reference: `ED-${year}-${String(row.edition_number).padStart(3, "0")}`,
    title: row.title ?? `Edição ${row.edition_number}`,
    publicationDate: row.publication_date,
    pdfUrl,
    pageCount: row.page_count ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

/**
 * Associa o PDF enviado por upload a uma edição — `pdf_storage_path` não
 * faz parte do contrato de domínio (`NewspaperEditionChanges`), é detalhe
 * do provider real, como `registerUploadedMediaAsset` (Fase 26). Limpa
 * `pdf_url` (URL externa) quando um upload substitui uma referência
 * externa antiga — nunca os dois ao mesmo tempo.
 */
export async function attachEditionPdf(
  client: SupabaseClient,
  editionId: string,
  storagePath: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ pdf_storage_path: storagePath, pdf_url: null })
    .eq("id", editionId);
  if (error) throw new Error(error.message);
}

export function createNewspaperEditionRepositorySupabase(client: SupabaseClient): NewspaperEditionRepository {
  return {
    async list() {
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .order("publication_date", { ascending: false });
      if (error) throw new Error(error.message);
      return Promise.all((data ?? []).map((row) => toDomain(client, row as NewspaperEditionRow)));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(client, data as NewspaperEditionRow) : null;
    },

    async create(record: NewNewspaperEditionRecord) {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          edition_number: record.editionNumber,
          publication_date: record.publicationDate,
          title: record.title,
          pdf_url: record.pdfUrl ?? null,
          page_count: record.pageCount ?? null,
          active: record.active,
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toDomain(client, data as NewspaperEditionRow);
    },

    async update(id, changes: NewspaperEditionChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.editionNumber !== undefined) patch.edition_number = changes.editionNumber;
      if (changes.publicationDate !== undefined) patch.publication_date = changes.publicationDate;
      if (changes.title !== undefined) patch.title = changes.title ?? null;
      if (changes.pdfUrl !== undefined) patch.pdf_url = changes.pdfUrl ?? null;
      if (changes.pageCount !== undefined) patch.page_count = changes.pageCount ?? null;
      if (changes.active !== undefined) patch.active = changes.active;

      const { data, error } = await client.from(TABLE).update(patch).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(client, data as NewspaperEditionRow);
    },
  };
}
