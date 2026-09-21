import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewspaperEdition } from "@ir/types";
import type { NewspaperEditionRepository } from "@ir/core";

const TABLE = "newspaper_editions";
const COLUMNS = "id, edition_number, publication_date, title, pdf_url, created_at";

interface NewspaperEditionRow {
  id: string;
  edition_number: number;
  publication_date: string;
  title: string | null;
  pdf_url: string | null;
  created_at: string;
}

/**
 * `NewspaperEdition.reference` (domínio, ex.: "ED-2026-038") não tem coluna
 * própria — a tabela real guarda `edition_number` (inteiro). Gerado aqui a
 * partir do ano da `publication_date` + `edition_number`, mesmo formato já
 * usado pelos dados mock. `pageCount` não tem coluna (não é usado por
 * nenhuma tela de `apps/sistema` — só o `pageCount` do resultado de uma
 * extração de PDF, um conceito diferente) e fica sempre `undefined`.
 */
function toDomain(row: NewspaperEditionRow): NewspaperEdition {
  const year = row.publication_date.slice(0, 4);
  return {
    id: row.id,
    reference: `ED-${year}-${String(row.edition_number).padStart(3, "0")}`,
    title: row.title ?? `Edição ${row.edition_number}`,
    publicationDate: row.publication_date,
    pdfUrl: row.pdf_url ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Somente leitura, como o contrato/serviço já eram (cadastro de edições
 * não é o foco desta fase nem das anteriores) — só troca a origem dos
 * dados de mock para o banco real.
 */
export function createNewspaperEditionRepositorySupabase(client: SupabaseClient): NewspaperEditionRepository {
  return {
    async list() {
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .order("publication_date", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as NewspaperEditionRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as NewspaperEditionRow) : null;
    },
  };
}
