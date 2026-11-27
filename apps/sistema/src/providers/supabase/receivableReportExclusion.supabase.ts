import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * IDs de títulos classificados como teste (`receivables.report_excluded_at`).
 * Fonte única para relatórios, visão financeira e consulta central: todos
 * excluem estes IDs sem apagar nem alterar o histórico.
 *
 * Enquanto a migration 20261127150000 não estiver aplicada a coluna não existe
 * (erro 42703): nesse caso não há exclusão (comportamento anterior) em vez de
 * quebrar os relatórios. Qualquer outro erro é propagado.
 */
export async function listReportExcludedReceivableIds(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from("receivables").select("id").not("report_excluded_at", "is", null).limit(1000);
  if (error) {
    if (error.code === "42703") return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => String(row.id));
}

/** Aplica `NOT IN` ao campo informado quando há IDs excluídos. */
export function withoutExcludedReceivables<T extends { not: (column: string, operator: string, value: string) => T }>(
  query: T,
  column: string,
  excludedIds: string[],
): T {
  return excludedIds.length ? query.not(column, "in", `(${excludedIds.join(",")})`) : query;
}
