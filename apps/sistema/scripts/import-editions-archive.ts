/**
 * Cadastro do acervo histórico do Jornal Online: as fichas em
 * `newspaper_editions` para os PDFs que JÁ estão no R2
 * (`acervo/edicoes/IR NNN.pdf`) — o PDF não é movido nem copiado — com as
 * capas já geradas localmente (scripts/prepare-editions-archive-covers.ts) e
 * as datas do relatório consolidado (496 confirmadas pela capa + 1 revisada).
 *
 * Modos (rodar dentro de apps/sistema):
 *   1) Padrão — SÓ LÊ e gera o SQL para revisão; nada é gravado:
 *      npx tsx --env-file=.env.local --conditions=react-server scripts/import-editions-archive.ts --actor="Nome do perfil"
 *   2) Envia as capas ao R2 (idempotente: mesmo conteúdo = mesmo nome):
 *      npx tsx --env-file=.env.local --conditions=react-server scripts/import-editions-archive.ts --upload-covers
 *   3) Aplica o SQL gerado (transação única; edição já existente é ignorada):
 *      supabase db query --linked -f <arquivo .sql indicado no modo 1>
 *
 * Fichas nascem publicadas, sem notificação e fora da fila de matérias.
 * Datas não confirmadas pela capa são listadas para conferência no painel
 * (Editorial → Edições → Editar).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  editionCoverBufferKey,
  isEditionR2ReadConfigured,
  listEditionArchiveObjects,
  uploadEditionCoverBufferToR2,
} from "../src/providers/r2/editionArchive.r2";
import { parseEditionArchiveObjectKey } from "../src/providers/r2/editionsArchiveImportPlan";
import {
  buildArchiveRegistrationSql,
  needsDateReview,
  parseArchiveDatesCsv,
  type ArchiveRegistrationItem,
  type ArchiveSkipReason,
} from "../src/providers/r2/editionsArchiveRegistration";

const REPORTS_DIR = "../../docs/relatorios-locais";
const DEFAULT_DATES_CSV = `${REPORTS_DIR}/jornal-online-acervo-datas/editions-archive-dates-report-consolidado.csv`;
const DEFAULT_COVERS_DIR = `${REPORTS_DIR}/jornal-online-capas-preparadas`;
const DEFAULT_SQL_OUT = `${REPORTS_DIR}/jornal-online-acervo-datas/cadastro-acervo.sql`;
const UPLOAD_CONCURRENCY = 4;

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function coverPath(dir: string, editionNumber: number): string {
  return join(dir, `edicao-${String(editionNumber).padStart(4, "0")}.webp`);
}

async function fetchExistingEditionNumbers(): Promise<Set<number>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY ausentes (nenhum valor exibido).");
  const { data, error } = await createClient(url, key).from("newspaper_editions").select("edition_number");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.edition_number as number));
}

async function main(): Promise<void> {
  const uploadCovers = process.argv.includes("--upload-covers");
  const actorName = parseArg("actor");
  const datesCsv = parseArg("dates") ?? DEFAULT_DATES_CSV;
  const coversDir = parseArg("covers-dir") ?? DEFAULT_COVERS_DIR;
  const sqlOut = parseArg("out") ?? DEFAULT_SQL_OUT;

  if (!isEditionR2ReadConfigured()) throw new Error("R2 de edições não configurado (nenhum valor exibido).");
  if (!existsSync(datesCsv)) throw new Error(`Relatório de datas não encontrado: ${datesCsv}`);
  if (!uploadCovers && !actorName) throw new Error('Informe quem está executando: --actor="Nome do perfil".');

  const dates = parseArchiveDatesCsv(readFileSync(datesCsv, "utf8"));
  const existing = await fetchExistingEditionNumbers();
  const objects = await listEditionArchiveObjects("acervo/edicoes/");
  const pdfs = objects
    .map((obj) => ({ obj, editionNumber: parseEditionArchiveObjectKey(obj.key) }))
    .filter((entry): entry is { obj: (typeof objects)[number]; editionNumber: number } => entry.editionNumber !== null)
    .sort((a, b) => a.editionNumber - b.editionNumber);

  const skipped: Array<{ editionNumber: number; reason: ArchiveSkipReason }> = [];
  const items: Array<ArchiveRegistrationItem & { coverFile: string }> = [];
  const review: string[] = [];

  for (const { obj, editionNumber } of pdfs) {
    const record = dates.get(editionNumber);
    const file = coverPath(coversDir, editionNumber);
    if (existing.has(editionNumber)) skipped.push({ editionNumber, reason: "ja_cadastrada" });
    else if (!record?.dateIso) skipped.push({ editionNumber, reason: "sem_data" });
    else if (!existsSync(file)) skipped.push({ editionNumber, reason: "sem_capa_local" });
    else {
      const coverKey = editionCoverBufferKey(readFileSync(file), { editionNumber, publicationDate: record.dateIso });
      items.push({ editionNumber, pdfKey: obj.key, pdfSize: obj.size, dateIso: record.dateIso, coverKey, coverFile: file });
      if (needsDateReview(record)) review.push(`edição ${editionNumber} = ${record.dateIso} (${record.statusFinal})`);
    }
  }
  const inR2 = new Set(pdfs.map((entry) => entry.editionNumber));
  for (const editionNumber of dates.keys()) {
    if (!inR2.has(editionNumber)) skipped.push({ editionNumber, reason: "pdf_ausente_no_r2" });
  }

  console.log(`[acervo] PDFs no R2: ${pdfs.length} | fichas já existentes: ${existing.size} | a cadastrar: ${items.length} | puladas: ${skipped.length}`);
  for (const item of skipped) console.log(`[acervo] pulada: edição ${item.editionNumber} (${item.reason})`);
  for (const line of review) console.log(`[acervo] DATA A CONFERIR no painel: ${line}`);

  if (uploadCovers) {
    let sent = 0;
    const failures: string[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, async () => {
        while (next < items.length) {
          const item = items[next];
          next += 1;
          try {
            const result = await uploadEditionCoverBufferToR2(readFileSync(item.coverFile), {
              editionNumber: item.editionNumber,
              publicationDate: item.dateIso,
            });
            if (result.key !== item.coverKey) throw new Error("nome da capa divergente do SQL gerado");
            sent += 1;
            if (sent % 50 === 0) console.log(`[acervo] ${sent}/${items.length} capas enviadas...`);
          } catch (error) {
            failures.push(`edição ${item.editionNumber}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }),
    );
    console.log(`[acervo] Capas enviadas: ${sent} | falhas: ${failures.length}`);
    for (const failure of failures) console.log(`[acervo] FALHA ${failure}`);
    if (failures.length > 0) {
      console.log("[acervo] Rodar de novo reenvia sem duplicar (mesmo conteúdo = mesmo nome).");
      process.exitCode = 1;
    }
    return;
  }

  writeFileSync(sqlOut, buildArchiveRegistrationSql(items, actorName as string, new Date()), "utf8");
  console.log(`[acervo] SQL gerado para revisão: ${sqlOut}`);
  console.log("[acervo] Nada foi gravado no banco nem no R2.");
}

main().catch((error) => {
  console.error("[acervo] Erro:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
