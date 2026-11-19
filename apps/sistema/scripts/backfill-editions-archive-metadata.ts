/**
 * Completa metadados faltantes do acervo R2, SEM modificar arquivos, capas,
 * links públicos, estado editorial, datas ou agendamentos.
 *
 * Escopo aprovado: SOMENTE 2025 e 2026 (não processar 2024 ou anteriores).
 * Padrão: prévia (somente leitura); --limit=3 por rodada, --concurrency=1.
 * Somente --apply autoriza UPDATE condicional em newspaper_editions.
 *
 * Rodar na pasta apps/sistema, com o .env.local já existente:
 * NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/backfill-editions-archive-metadata.ts [--limit=3] [--concurrency=1]
 * NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/backfill-editions-archive-metadata.ts --apply --limit=3
 *
 * Checkpoint JSON local git-ignorado; prévia retoma do ponto anterior.
 * --apply relê SEMPRE o PDF do R2 e usa compare-and-set no banco.
 * Limite explícito: máximo 25 PDFs por execução. Sem cron/job automático.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadPdfDocument } from "@ir/pdf-extraction";
import {
  isEditionR2ReadConfigured,
  getEditionPdfFromR2,
} from "../src/providers/r2/editionArchive.r2";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../src/lib/supabase/admin";
import {
  planArchiveMetadataUpdate,
  sha256OfArchivePdf,
  type ArchiveMetadataRow,
  type ArchiveMetadataDecision,
} from "../src/lib/editorial/editionArchiveMetadata";

const OUT_DIR = "../../docs/relatorios-locais/jornal-online-metadados";
const CHECKPOINT = join(OUT_DIR, "metadados-checkpoint.json");
const MAX_PER_RUN = 25;
const START_DATE = "2025-01-01";
const END_DATE_EXCLUSIVE = "2027-01-01";
const SELECT_COLUMNS = "id, edition_number, archive_provider, pdf_r2_key, pdf_file_size, pdf_sha256, page_count";

type CheckpointRecord = {
  id: string;
  editionNumber: number;
  key: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  computedAt: string;
  applied: boolean;
};
type ResultRecord = {
  id: string;
  editionNumber: number;
  status: "previa" | "atualizado" | "conflito" | "erro";
  detail: string;
};

function numberArg(flag: string, fallback: number, max: number): number {
  const value = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (!value) return fallback;
  const raw = value.slice(flag.length + 3);
  const parsed = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`--${flag} deve ser inteiro entre 1 e ${max}.`);
  }
  return parsed;
}

function readCheckpoint(): Map<string, CheckpointRecord> {
  const map = new Map<string, CheckpointRecord>();
  if (!existsSync(CHECKPOINT)) return map;
  const entries = JSON.parse(readFileSync(CHECKPOINT, "utf8")) as CheckpointRecord[];
  for (const entry of entries) {
    if (entry.id && entry.key && Number.isInteger(entry.pageCount)) map.set(entry.id, entry);
  }
  return map;
}

function saveCheckpoint(map: Map<string, CheckpointRecord>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CHECKPOINT, JSON.stringify([...map.values()].sort((a, b) => a.editionNumber - b.editionNumber), null, 2), "utf8");
}

function clientForRead(): SupabaseClient {
  if (hasServiceRoleKey()) return createSupabaseAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Configuração pública do Supabase ausente. Nenhuma credencial será exibida.");
  }
  console.warn("[metadados] Apenas leitura pública ativa: sem service role, edições inativas ficam fora da prévia.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Proteção adicional contra sobrescrita de edição alterada durante o processamento. */
async function applyIfStillMissing(
  client: SupabaseClient,
  row: ArchiveMetadataRow,
  decision: Extract<ArchiveMetadataDecision, { status: "update" }>,
): Promise<boolean> {
  let q = client.from("newspaper_editions")
    .update(decision.patch)
    .eq("id", row.id)
    .eq("edition_number", row.edition_number)
    .eq("archive_provider", "r2")
    .eq("pdf_r2_key", row.pdf_r2_key as string)
    .eq("pdf_file_size", row.pdf_file_size as number);
  // Mesmo que outra requisição salve os dados durante o download,
  // nenhum valor preexistente será sobrescrito.
  if ("pdf_sha256" in decision.patch) q = q.is("pdf_sha256", null);
  else q = q.eq("pdf_sha256", row.pdf_sha256 as string);
  if ("page_count" in decision.patch) q = q.is("page_count", null);
  else q = q.eq("page_count", row.page_count as number);
  const { data, error } = await q.select("id");
  if (error) throw new Error("Falha ao atualizar metadados da edição.");
  return Array.isArray(data) && data.length === 1;
}

async function processEdition(
  row: ArchiveMetadataRow,
  client: SupabaseClient,
  apply: boolean,
  checkpoint: Map<string, CheckpointRecord>,
): Promise<ResultRecord> {
  try {
    const bytes = await getEditionPdfFromR2(row.pdf_r2_key as string);
    const sha256 = sha256OfArchivePdf(bytes);
    // A quantidade de páginas vem do documento PDF, nunca da data ou do tamanho.
    const doc = await loadPdfDocument(bytes);
    let pageCount: number;
    try {
      pageCount = doc.numPages;
    } finally {
      await doc.destroy();
    }

    const decision = planArchiveMetadataUpdate(row, {
      sizeBytes: bytes.byteLength,
      sha256,
      pageCount,
    });
    if (decision.status === "conflict") {
      return { id: row.id, editionNumber: row.edition_number, status: "conflito", detail: decision.reason };
    }
    if (decision.status === "unchanged") {
      return { id: row.id, editionNumber: row.edition_number, status: "previa", detail: "Metadados já completos." };
    }

    // Dados derivados de bytes reais; relatório/checkpoint é LOCAL, sem PDFs.
    checkpoint.set(row.id, {
      id: row.id, editionNumber: row.edition_number, key: row.pdf_r2_key as string,
      sizeBytes: bytes.byteLength, sha256, pageCount,
      computedAt: new Date().toISOString(), applied: false,
    });
    saveCheckpoint(checkpoint);

    if (!apply) {
      return { id: row.id, editionNumber: row.edition_number, status: "previa",
        detail: `Conferidos ${pageCount} páginas, tamanho e SHA-256; nenhuma gravação no banco.` };
    }
    const updated = await applyIfStillMissing(client, row, decision);
    if (!updated) {
      return { id: row.id, editionNumber: row.edition_number, status: "conflito",
        detail: "Ficha mudou durante a análise; não foi sobrescrita. Recarregue e tente novamente." };
    }
    const saved = checkpoint.get(row.id);
    if (saved) {
      checkpoint.set(row.id, { ...saved, applied: true });
      saveCheckpoint(checkpoint);
    }
    return { id: row.id, editionNumber: row.edition_number, status: "atualizado",
      detail: `Campos preenchidos: ${Object.keys(decision.patch).join(", ")}.` };
  } catch (error) {
    // Não imprimir stack ou URLs/headers do cliente R2/Supabase nos relatórios.
    return { id: row.id, editionNumber: row.edition_number, status: "erro",
      detail: error instanceof Error ? error.name : "Falha de processamento" };
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const limit = numberArg("limit", 3, MAX_PER_RUN);
  const concurrency = numberArg("concurrency", 1, 2);

  if (!isEditionR2ReadConfigured()) {
    throw new Error("R2 de edições não configurado. Nenhum segredo será exibido.");
  }
  if (apply && !hasServiceRoleKey()) {
    throw new Error("--apply requer SUPABASE_SERVICE_ROLE_KEY no ambiente autorizado. Nenhuma gravação executada.");
  }

  const client = apply ? createSupabaseAdminClient() : clientForRead();
  const { data, error } = await client.from("newspaper_editions")
    .select(SELECT_COLUMNS)
    .eq("archive_provider", "r2")
    // Proteção no próprio SELECT: os arquivos de 2024 e anteriores não
    // entram na análise nem no UPDATE, mesmo se houver campos faltantes.
    .gte("publication_date", START_DATE)
    .lt("publication_date", END_DATE_EXCLUSIVE)
    .or("pdf_sha256.is.null,page_count.is.null")
    .order("edition_number", { ascending: false })
    .limit(1000);

  if (error) throw new Error("Não foi possível consultar as fichas do acervo.");
  const rows = (data ?? []) as ArchiveMetadataRow[];
  if (rows.length >= 1000) throw new Error("Mais de 999 fichas: paginar em vez de processar levantamento incompleto.");
  const valid = rows.filter((row) => row.pdf_r2_key && Number.isSafeInteger(row.pdf_file_size) && (row.pdf_file_size as number) > 0);
  const checkpoint = force ? new Map<string, CheckpointRecord>() : readCheckpoint();
  const pending = (apply || force
    ? valid
    : valid.filter((row) => {
        const done = checkpoint.get(row.id);
        return !done || done.key !== row.pdf_r2_key || done.sizeBytes !== row.pdf_file_size;
      })
  ).slice(0, limit);

  console.log(`[metadados] Escopo autorizado: edições publicadas em 2025 ou 2026.`);
  console.log(`[metadados] Fichas R2 ainda incompletas: ${rows.length} | válidas para análise: ${valid.length}`);
  console.log(`[metadados] Modo: ${apply ? "APLICAR com confirmação de dados existentes" : "PRÉVIA, somente leitura"} | amostra: ${pending.length} | concorrência: ${concurrency}`);
  if (pending.length === 0) {
    console.log("[metadados] Nenhuma ficha pendente nesta rodada.");
    return;
  }

  const results: ResultRecord[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (next < pending.length) {
      const row = pending[next++];
      const result = await processEdition(row, client, apply, checkpoint);
      results.push(result);
      console.log(`[metadados] Edição ${result.editionNumber}: ${result.status} — ${result.detail}`);
    }
  }));

  mkdirSync(OUT_DIR, { recursive: true });
  const reportPath = join(OUT_DIR, `metadados-ultima-rodada-${apply ? "aplicacao" : "previa"}.json`);
  writeFileSync(reportPath, JSON.stringify(results.sort((a, b) => b.editionNumber - a.editionNumber), null, 2), "utf8");
  console.log(`[metadados] Relatório local: ${reportPath}`);
  if (!apply) console.log("[metadados] Nada foi alterado no Supabase nem no R2. Para aplicar é necessário --apply.");
  if (results.some((r) => r.status === "conflito" || r.status === "erro")) process.exitCode = 1;
}

main().catch(() => {
  console.error("[metadados] Erro de configuração ou consulta. Nenhum segredo será exibido.");
  process.exitCode = 1;
});
