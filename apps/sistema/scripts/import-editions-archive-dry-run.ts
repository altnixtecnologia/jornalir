/**
 * Importador de metadados do acervo histórico de edições — SOMENTE
 * DRY-RUN. Lê o bucket R2 exclusivo de edições e o cadastro
 * `newspaper_editions`, e gera um relatório CSV de conciliação.
 *
 * NUNCA grava no Supabase nem no R2 (sem PUT/INSERT/UPDATE/DELETE em
 * nenhum ponto deste arquivo). A vinculação real de cada edição
 * continuará sendo feita por `attachEditionR2Archive`, chamada só em uma
 * etapa futura explicitamente autorizada, edição por edição ou em lote
 * revisado — nunca a partir deste script.
 *
 * Uso: npx tsx scripts/import-editions-archive-dry-run.ts [--prefix=acervo/edicoes/] [--out=<arquivo.csv>]
 */
import { isEditionR2ReadConfigured, listEditionArchiveObjects } from "../src/providers/r2/editionArchive.r2";
import {
  buildEditionArchiveImportReport,
  editionArchiveImportReportToCsv,
  type ExistingEditionRow,
} from "../src/providers/r2/editionsArchiveImportPlan";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../src/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const EDITION_COLUMNS = "edition_number, publication_date, archive_provider, pdf_r2_key, pdf_file_size, pdf_sha256";

/**
 * Sem SUPABASE_SERVICE_ROLE_KEY, cai para o cliente público (mesma chave
 * anon/publishable já usada pelo portal). Continua SOMENTE LEITURA — a
 * diferença é que a política pública só expõe edições com active=true
 * (newspaper_editions_select_public), então edições inativas/rascunho
 * ficam fora deste cruzamento até a chave de serviço ser configurada.
 */
async function readExistingEditions(): Promise<{ rows: ExistingEditionRow[]; usedServiceRole: boolean }> {
  if (hasServiceRoleKey()) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("newspaper_editions").select(EDITION_COLUMNS);
    if (error) throw new Error(error.message);
    return { rows: toExistingEditionRows(data), usedServiceRole: true };
  }

  console.warn(
    "[dry-run] SUPABASE_SERVICE_ROLE_KEY ausente — usando a chave pública (anon). " +
      "Só edições com active=true serão vistas nesta leitura; configure a chave de serviço para ver também " +
      "edições inativas/rascunho.",
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausentes — não é possível ler nada.");
  }
  const anon = createClient(url, anonKey);
  const { data, error } = await anon.from("newspaper_editions").select(EDITION_COLUMNS);
  if (error) throw new Error(error.message);
  return { rows: toExistingEditionRows(data), usedServiceRole: false };
}

function toExistingEditionRows(data: unknown[] | null): ExistingEditionRow[] {
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      editionNumber: r.edition_number as number,
      publicationDate: (r.publication_date as string | null) ?? null,
      archiveProvider: (r.archive_provider as string | null) ?? null,
      pdfR2Key: (r.pdf_r2_key as string | null) ?? null,
      pdfFileSize: (r.pdf_file_size as number | null) ?? null,
      pdfSha256: (r.pdf_sha256 as string | null) ?? null,
    };
  });
}

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

async function main() {
  if (!isEditionR2ReadConfigured()) {
    console.error(
      "R2 de edições não está configurado para leitura (verifique R2_EDITIONS_ENDPOINT, R2_EDITIONS_BUCKET, " +
        "R2_EDITIONS_ACCESS_KEY_ID e R2_EDITIONS_SECRET_ACCESS_KEY). Nenhum valor é exibido aqui por segurança. " +
        "R2_EDITIONS_PUBLIC_BASE_URL não é exigida aqui — bucket pode continuar privado até termos domínio público.",
    );
    process.exitCode = 1;
    return;
  }
  const prefix = parseArg("prefix", "acervo/edicoes/");
  const outPath = parseArg("out", "editions-archive-import-dry-run.csv");

  console.log(`[dry-run] Listando objetos em R2 sob o prefixo "${prefix}" (bucket de edições)...`);
  const objects = await listEditionArchiveObjects(prefix);
  console.log(`[dry-run] ${objects.length} objetos encontrados no bucket.`);

  console.log("[dry-run] Lendo newspaper_editions (somente leitura)...");
  const { rows: existingEditions, usedServiceRole } = await readExistingEditions();
  console.log(
    `[dry-run] ${existingEditions.length} edições encontradas em newspaper_editions` +
      (usedServiceRole ? "." : " (somente active=true, chave de serviço ausente)."),
  );

  const report = buildEditionArchiveImportReport(
    objects.map((object) => ({ key: object.key, size: object.size })),
    existingEditions,
  );

  console.log("[dry-run] Resumo:");
  for (const [status, count] of Object.entries(report.counts)) {
    console.log(`  - ${status}: ${count}`);
  }
  console.log(`  - gaps (números ausentes no bucket dentro do intervalo observado): ${report.gaps.length}`);
  if (report.minEditionNumber !== null && report.maxEditionNumber !== null) {
    console.log(`  - intervalo observado: ${report.minEditionNumber}–${report.maxEditionNumber}`);
  }

  writeFileSync(outPath, editionArchiveImportReportToCsv(report), "utf8");
  console.log(`[dry-run] Relatório CSV gravado em: ${outPath}`);
  console.log("[dry-run] Nenhuma gravação foi feita no Supabase nem no R2. Nenhuma edição foi tornada pública.");
}

main().catch((error) => {
  console.error("[dry-run] Erro:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
