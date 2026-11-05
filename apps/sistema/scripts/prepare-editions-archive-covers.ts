/**
 * PREPARAÇÃO (não lote) do gerador de capas do acervo histórico do Jornal
 * Online. Renderiza a página 1 de cada PDF do bucket R2 exclusivo em WebP
 * (via `renderEditionCoverWebp`, que usa pdfjs-dist + @napi-rs/canvas +
 * sharp — todas licenças compatíveis com projeto proprietário; ver decisão
 * de licenciamento em docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md).
 *
 * IMPORTANTE: este script está PRONTO para rodar, mas por padrão só
 * processa uma AMOSTRA pequena (--limit, padrão 3) e GRAVA LOCALMENTE
 * (nunca no R2, nunca no Supabase). Para processar mais edições, aumente
 * --limit explicitamente; para as 497 completas, isso continua exigindo
 * autorização explícita separada (etapa de execução real, não esta).
 *
 * SOMENTE LEITURA no R2 (lista e baixa, nunca grava/apaga). A saída é
 * organizada por edição em uma pasta local git-ignorada
 * (docs/relatorios-locais/jornal-online-capas-preparadas/).
 *
 * Concorrência baixa e checkpoint/retomada, no mesmo padrão de
 * scripts/process-editions-archive-dates.ts (reaproveitado, não duplicado
 * em espírito — mesma estratégia de semáforo simples e checkpoint JSON).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/prepare-editions-archive-covers.ts \
 *     [--limit=3] [--concurrency=2] [--out-dir=caminho] [--force]
 *   (precisa de NODE_OPTIONS="--conditions=react-server" por causa de
 *   "server-only" em editionArchive.r2.ts)
 */
import {
  getEditionPdfFromR2,
  isEditionR2ReadConfigured,
  listEditionArchiveObjects,
} from "../src/providers/r2/editionArchive.r2";
import { parseEditionArchiveObjectKey } from "../src/providers/r2/editionsArchiveImportPlan";
import { renderEditionCoverWebp } from "../src/providers/r2/editionCoverRenderer";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_LIMIT = 3;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_OUT_DIR = "../../docs/relatorios-locais/jornal-online-capas-preparadas";

interface CoverResult {
  editionNumber: number;
  key: string;
  status: "gerada" | "erro";
  outputPath: string | null;
  widthPx: number | null;
  heightPx: number | null;
  webpBytes: number | null;
  renderMs: number | null;
  note: string;
}

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((v) => v.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onResult: (result: R) => void,
): Promise<void> {
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) return;
    const result = await worker(items[index]);
    onResult(result);
    await runNext();
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
}

function loadCheckpoint(path: string): Map<number, CoverResult> {
  const map = new Map<number, CoverResult>();
  if (!existsSync(path)) return map;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as CoverResult[];
    for (const r of raw) map.set(r.editionNumber, r);
  } catch {
    console.warn(`[capas] Checkpoint em ${path} ilegível — ignorando.`);
  }
  return map;
}

function saveCheckpoint(path: string, results: Map<number, CoverResult>): void {
  writeFileSync(path, JSON.stringify(Array.from(results.values()).sort((a, b) => a.editionNumber - b.editionNumber), null, 2), "utf8");
}

async function main() {
  if (!isEditionR2ReadConfigured()) {
    console.error("R2 de edições não está configurado para leitura. Nenhum valor exibido por segurança.");
    process.exitCode = 1;
    return;
  }

  const limit = Math.max(1, Number(parseArg("limit", String(DEFAULT_LIMIT))) || DEFAULT_LIMIT);
  const concurrency = Math.max(1, Number(parseArg("concurrency", String(DEFAULT_CONCURRENCY))) || DEFAULT_CONCURRENCY);
  const outDir = parseArg("out-dir", DEFAULT_OUT_DIR);
  const force = hasFlag("force");
  const checkpointPath = join(outDir, "covers-checkpoint.json");

  mkdirSync(outDir, { recursive: true });

  console.log("[capas] Listando objetos do bucket de edições (acervo/edicoes/)...");
  const objects = await listEditionArchiveObjects("acervo/edicoes/");
  const parsed = objects
    .map((obj) => ({ obj, editionNumber: parseEditionArchiveObjectKey(obj.key) }))
    .filter((e): e is { obj: typeof objects[number]; editionNumber: number } => e.editionNumber !== null)
    .sort((a, b) => a.editionNumber - b.editionNumber);

  console.log(`[capas] ${parsed.length} edições reconhecidas no bucket. Limite nesta execução: ${limit} (use --limit para mudar).`);
  if (limit >= parsed.length) {
    console.warn(
      `[capas] ATENÇÃO: --limit=${limit} cobre o acervo inteiro (${parsed.length}). ` +
        "Esta é a etapa de PREPARAÇÃO — confirme que a geração em lote das 497 capas foi autorizada antes de rodar com esse limite.",
    );
  }

  const resultsByEdition = force ? new Map<number, CoverResult>() : loadCheckpoint(checkpointPath);
  const pending = parsed.filter((e) => !resultsByEdition.has(e.editionNumber)).slice(0, limit);

  console.log(`[capas] ${pending.length} edição(ões) a processar agora (concorrência=${concurrency}), saída em: ${outDir}`);

  let processed = 0;
  await processWithConcurrency(
    pending,
    concurrency,
    async ({ obj, editionNumber }) => {
      const t0 = Date.now();
      try {
        const bytes = await getEditionPdfFromR2(obj.key);
        const { webpBuffer, widthPx, heightPx } = await renderEditionCoverWebp(bytes);
        const outputPath = join(outDir, `edicao-${String(editionNumber).padStart(4, "0")}.webp`);
        writeFileSync(outputPath, webpBuffer);
        const result: CoverResult = {
          editionNumber,
          key: obj.key,
          status: "gerada",
          outputPath,
          widthPx,
          heightPx,
          webpBytes: webpBuffer.length,
          renderMs: Date.now() - t0,
          note: "Gerada e gravada localmente. Nenhum upload ao R2, nenhuma gravação no Supabase.",
        };
        return result;
      } catch (error) {
        const result: CoverResult = {
          editionNumber,
          key: obj.key,
          status: "erro",
          outputPath: null,
          widthPx: null,
          heightPx: null,
          webpBytes: null,
          renderMs: Date.now() - t0,
          note: `Erro ao renderizar: ${error instanceof Error ? error.message : String(error)}`,
        };
        return result;
      }
    },
    (result) => {
      resultsByEdition.set(result.editionNumber, result);
      processed += 1;
      console.log(
        `[capas] (${processed}/${pending.length}) edição ${result.editionNumber}: ${result.status}` +
          (result.webpBytes ? ` (${result.webpBytes} bytes, ${result.renderMs}ms)` : ""),
      );
      saveCheckpoint(checkpointPath, resultsByEdition);
    },
  );

  const all = Array.from(resultsByEdition.values());
  console.log(`\n[capas] Total no checkpoint: ${all.length} de ${parsed.length} edições do acervo.`);
  console.log(`[capas] Checkpoint (retomável): ${checkpointPath}`);
  console.log("[capas] Nenhum upload ao R2. Nenhuma gravação no Supabase. Bucket continua privado.");
}

main().catch((error) => {
  console.error("[capas] Erro:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
