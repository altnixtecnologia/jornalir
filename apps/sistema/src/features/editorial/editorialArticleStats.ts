import type { SupabaseClient } from "@supabase/supabase-js";

export interface EditorialArticleStats {
  total: number | null;
  unpublished: number | null;
  scheduled: number | null;
  adjusting: number | null;
}

/**
 * Contagens via HEAD: sem carregar matérias, imagens, corpos ou dados pessoais.
 * "estimated" evita os timeouts do COUNT(*) nas mais de 23 mil linhas legadas.
 * Se o banco não conseguir contar, a interface mostra "—" (nunca um 0 falso).
 */
export async function getEditorialArticleStats(client: SupabaseClient): Promise<EditorialArticleStats> {
  const [total, unpublished, scheduled, adjusting] = await Promise.all([
    client.from("articles").select("id", { head: true, count: "estimated" }),
    client.from("articles").select("id", { head: true, count: "estimated" }).in("status", ["draft", "adjusting", "scheduled"]),
    client.from("articles").select("id", { head: true, count: "estimated" }).eq("status", "scheduled"),
    client.from("articles").select("id", { head: true, count: "estimated" }).eq("status", "adjusting"),
  ]);
  function value(row: { error: unknown; count: number | null }): number | null {
    return row.error ? null : row.count;
  }
  return { total: value(total), unpublished: value(unpublished), scheduled: value(scheduled), adjusting: value(adjusting) };
}
