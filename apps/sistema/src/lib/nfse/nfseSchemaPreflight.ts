import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pré-verificação de migração fiscal antes de acessar repositórios da NFS-e.
 *
 * A PR #89 passou a selecionar estas três colunas mesmo em listagens e
 * formulários vazios. O PostgreSQL oficial pode continuar no esquema
 * anterior, embora a aplicação esteja mais recente. Não ocultar/ignorar
 * as colunas: isso faria observações fiscais sumirem silenciosamente.
 *
 * A checagem usa SELECT LIMIT 0 para não ler dados de clientes e não
 * escreve nada no Supabase. Somente a migração já versionada em
 * supabase/migrations/20261122341000_nfse_fiscal_observations.sql
 * pode ativar a funcionalidade. A aplicação nunca aplica migrations.
 */
export const NFSE_OBSERVATIONS_MIGRATION = "20261122341000_nfse_fiscal_observations.sql";

export const NFSE_REQUIRED_PREPARATION_COLUMNS = [
  { table: "nfse_issuer_configs", column: "default_fiscal_observation" },
  { table: "nfse_drafts", column: "fiscal_observation" },
  { table: "nfse_drafts", column: "purchase_order_number" },
] as const;

export interface NfseSchemaPreflight {
  ready: boolean;
  missingColumns: string[];
  /** Rede, permissões ou outra falha não são equivalentes a coluna ausente. */
  checkFailed: boolean;
}

export type NfseSchemaProbe = (
  table: string,
  column: string,
) => Promise<{ error: { code?: string | null } | null }>;

/** Mantém falha fechada quando qualquer verificação não puder ser realizada. */
export async function checkNfsePreparationSchemaWithProbe(
  probe: NfseSchemaProbe,
): Promise<NfseSchemaPreflight> {
  const checks = await Promise.all(NFSE_REQUIRED_PREPARATION_COLUMNS.map(async (entry) => {
    try {
      const result = await probe(entry.table, entry.column);
      return { ...entry, error: result.error };
    } catch {
      return { ...entry, error: { code: "CHECK_FAILED" } };
    }
  }));
  const missingColumns = checks
    .filter((entry) => entry.error?.code === "42703" || entry.error?.code === "PGRST204")
    .map((entry) => `${entry.table}.${entry.column}`);
  const checkFailed = checks.some(
    (entry) => entry.error && entry.error.code !== "42703" && entry.error.code !== "PGRST204",
  );
  return { ready: !missingColumns.length && !checkFailed, missingColumns, checkFailed };
}

/** Executar somente no servidor e sempre após autorização da rota/ação. */
export async function checkNfsePreparationSchema(
  client: SupabaseClient,
): Promise<NfseSchemaPreflight> {
  return checkNfsePreparationSchemaWithProbe(async (table, column) => {
    const { error } = await client.from(table).select(column).limit(0);
    return { error: error ? { code: error.code } : null };
  });
}

export const NFSE_SCHEMA_NOT_READY_MESSAGE =
  "Preparação fiscal suspensa: o esquema NFS-e do banco não está sincronizado " +
  "com esta versão do sistema. Nenhum dado fiscal foi alterado.";
