#!/usr/bin/env node
// Motor de migração do legado por lotes (Fase 35). Reaproveita o coletor
// da Fase 34 (lib/http.mjs, lib/parse.mjs). Dois modos:
//   --mode=preflight (padrão): calcula o esperado do lote, não grava nada.
//   --mode=import: grava de verdade — exige --commit explícito. Matérias e
//     vínculos ficam no Supabase; imagens novas são otimizadas e enviadas
//     DIRETO ao Cloudflare R2 (nunca ao Supabase Storage). Sem --commit,
//     roda em dry-run (simula, loga o que faria, não grava).
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText, createRateLimiter } from "./lib/http.mjs";
import { parseArticlePage } from "./lib/parse.mjs";
import { normalizeUrl } from "./lib/identity.mjs";
import { getBatch, CATEGORY_TO_SECTION_SLUG } from "./lib/batches.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, candidateKey, collectImageRefs, classifyCandidates } from "./lib/pipeline.mjs";
import { supabaseAdmin, resolveGeralLocalityId, importCandidate } from "./lib/importer.mjs";

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const BATCH_KEY = args.batch;
const MODE = args.mode || "preflight";
const COMMIT = Boolean(args.commit);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const RPS = args.rps ? Number(args.rps) : 4;
const FROM_DATE = typeof args.from === "string" ? args.from : null;
const TO_DATE = typeof args.to === "string" ? args.to : null;
const IS_INCREMENTAL = Boolean(FROM_DATE || TO_DATE);

if (!BATCH_KEY) {
  console.error("Uso: node migrate.mjs --batch=2015-2016 [--mode=preflight|import] [--commit] [--limit=N] [--rps=4] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]");
  process.exit(1);
}
const batch = getBatch(BATCH_KEY);

const batchDir = path.join(AUDIT_DIR, "output", "batches", BATCH_KEY);
const DETAIL_CACHE_FILE = path.join(batchDir, "details.ndjson");
const CHECKPOINT_FILE = path.join(batchDir, "checkpoint.json");
const PREFLIGHT_FILE = path.join(batchDir, "preflight.json");
const EXCEPTIONS_FILE = path.join(batchDir, "date-exceptions.json");
const IMAGE_EXCEPTIONS_FILE = path.join(batchDir, "image-exceptions.ndjson");
const NEEDS_REVIEW_FILE = path.join(batchDir, "needs-review.json");
const REJECTED_FILE = path.join(batchDir, "rejected.json");
const QUARANTINED_FILE = path.join(batchDir, "quarantined.json");

async function loadCheckpoint() {
  if (existsSync(CHECKPOINT_FILE)) return JSON.parse(await readFile(CHECKPOINT_FILE, "utf8"));
  return { detailsFetched: {}, imported: {}, failedArticles: {}, images: {} };
}
async function saveCheckpoint(cp) {
  await writeFile(CHECKPOINT_FILE, JSON.stringify(cp, null, 2), "utf8");
}

async function loadDetailCache() {
  const cache = new Map();
  if (!existsSync(DETAIL_CACHE_FILE)) return cache;
  const raw = await readFile(DETAIL_CACHE_FILE, "utf8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    cache.set(row.key, row.detail);
  }
  return cache;
}

/** Busca (com cache/checkpoint) a página completa de cada candidata do
 * lote — usado tanto pelo preflight (para números reais de imagem/corpo)
 * quanto pela importação (mesmo fetch, nunca duas vezes por matéria). */
async function ensureDetails(eligible, throttle, log) {
  const cache = await loadDetailCache();
  const checkpoint = await loadCheckpoint();
  let fetched = 0;
  for (const c of eligible) {
    const key = candidateKey(c);
    if (cache.has(key)) continue;
    if (fetched >= LIMIT) break;
    await throttle();
    const { ok, text, status } = await fetchText(c.primary.url);
    if (!ok) {
      checkpoint.failedArticles[key] = { url: c.primary.url, status };
      await saveCheckpoint(checkpoint);
      log(`  [erro] detalhe ${c.primary.url} status=${status}`);
      continue;
    }
    const detail = parseArticlePage(text, c.primary.url);
    await appendFile(DETAIL_CACHE_FILE, JSON.stringify({ key, detail }) + "\n", "utf8");
    cache.set(key, detail);
    checkpoint.detailsFetched[key] = true;
    fetched += 1;
    if (fetched % 100 === 0) {
      await saveCheckpoint(checkpoint);
      log(`  detalhes buscados: ${fetched}`);
    }
  }
  await saveCheckpoint(checkpoint);
  log(`  total em cache após esta execução: ${cache.size}/${eligible.length}`);
  return cache;
}

/**
 * Classifica cada candidata do lote em eligible/needs_review/quarantined/
 * rejected via o pipeline compartilhado (lib/pipeline.mjs — a MESMA
 * barreira de integridade que o importador usa) e só então calcula as
 * contagens do preflight (item 9) EXCLUSIVAMENTE sobre o conjunto `eligible`.
 */
async function runPreflight(eligible, dateExceptions, cache, log) {
  const { eligibleList: eligibleRaw, needsReviewList: needsReviewRaw, quarantinedList: quarantinedRaw, rejectedList: rejectedRaw } =
    classifyCandidates(eligible, cache);

  const toRecord = ({ candidate: c, detail, reasons }) => ({
    url: c.primary.url,
    title: detail?.title || c.primary.title,
    category: c.primary.category,
    allCategories: c.allCategories,
    publishedIso: c.publishedIso,
    reasons,
  });
  const eligibleList = eligibleRaw; // mantém {candidate, detail} para uso pela importação
  const needsReviewList = needsReviewRaw.map(toRecord);
  const quarantinedList = quarantinedRaw.map(toRecord);
  const rejectedList = rejectedRaw.map(toRecord);

  let withImage = 0;
  let withoutImage = 0;
  let imageRefCount = 0;
  const uniqueImageUrls = new Set();
  const bySection = {};

  for (const { candidate: c, detail } of eligibleList) {
    const sectionSlug = CATEGORY_TO_SECTION_SLUG[c.primary.category] ?? null;
    bySection[sectionSlug ?? "(sem mapeamento)"] = (bySection[sectionSlug ?? "(sem mapeamento)"] ?? 0) + 1;

    const refs = collectImageRefs(detail);
    if (refs.length > 0) withImage += 1;
    else withoutImage += 1;
    imageRefCount += refs.length;
    for (const r of refs) uniqueImageUrls.add(normalizeUrl(r.src));
  }

  const summary = {
    batch: batch.key,
    range: { start: batch.start, end: batch.end },
    generatedAt: new Date().toISOString(),
    itemsFound: eligible.length,
    uniqueUrls: eligible.length, // já deduplicado por identidade antes de chegar aqui
    dateExceptions: dateExceptions.length,
    barreiraIntegridade: {
      eligible: eligibleList.length,
      needsReview: needsReviewList.length,
      quarantined: quarantinedList.length,
      rejected: rejectedList.length,
    },
    eligibleArticles: eligibleList.length,
    withImage,
    withoutImage,
    totalImageReferences: imageRefCount,
    uniqueImageUrls: uniqueImageUrls.size,
    distribuicaoPorEditoria: bySection,
  };

  await mkdir(batchDir, { recursive: true });
  await writeFile(PREFLIGHT_FILE, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(
    EXCEPTIONS_FILE,
    JSON.stringify(
      dateExceptions.map((c) => ({
        url: c.primary.url,
        title: c.primary.title,
        category: c.primary.category,
        rawDate: c.rawDate,
      })),
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(NEEDS_REVIEW_FILE, JSON.stringify(needsReviewList, null, 2), "utf8");
  await writeFile(REJECTED_FILE, JSON.stringify(rejectedList, null, 2), "utf8");
  await writeFile(QUARANTINED_FILE, JSON.stringify(quarantinedList, null, 2), "utf8");

  log("\n== PREFLIGHT " + batch.key + " ==");
  log(JSON.stringify(summary, null, 2));
  log(`\nExceções de data (fora da carga automática): ${dateExceptions.length} -> ${EXCEPTIONS_FILE}`);
  log(`Precisam de revisão manual (não importadas automaticamente): ${needsReviewList.length} -> ${NEEDS_REVIEW_FILE}`);
  log(`Em quarentena editorial (categoria inteira ainda não liberada): ${quarantinedList.length} -> ${QUARANTINED_FILE}`);
  log(`Rejeitadas (falha de busca): ${rejectedList.length} -> ${REJECTED_FILE}`);
  return { summary, eligibleList, needsReviewList, rejectedList, quarantinedList };
}

// ---- modo import ----

// `eligiblePairs` já passou pela barreira de integridade (lib/integrity.mjs)
// — só chega aqui quem foi classificado como "eligible", nunca
// needs_review/quarantined/rejected (Fase 35, item explícito do usuário).
async function runImport(eligiblePairs, preflightSummary, log) {
  const dryRun = !COMMIT;
  const trackBatch = !IS_INCREMENTAL;
  log(dryRun ? "\n== MODO IMPORT (dry-run — nenhuma gravação real) ==" : "\n== MODO IMPORT (--commit, gravando de verdade) ==");

  const sb = dryRun ? null : supabaseAdmin();
  const sectionCache = new Map();
  const localityId = dryRun ? "dry-run" : await resolveGeralLocalityId(sb);
  const throttle = createRateLimiter(RPS);

  const batchStats = {
    imported: 0,
    skippedExisting: 0,
    failedArticles: 0,
    uploadedImages: 0,
    reusedImages: 0,
    alreadyLinkedImages: 0,
    correctedImages: 0,
    failedImages: 0,
  };
  let batchRowId = null;

  let baseMetadata = {};
  if (!dryRun && trackBatch) {
    // Persiste o esperado do preflight (item 5) — a reconciliação final
    // (item 4) compara o banco contra ESTES números, nunca contra um
    // "sucesso" definido só por failedArticles === 0.
    const { data: existingBatch } = await sb.from("legacy_migration_batches").select("id, status, metadata").eq("batch_key", batch.key).maybeSingle();

    // Bloqueio de segurança (revisão do ChatGPT, Fase 43B): um lote já
    // `complete` nunca pode ser reaberto por uma execução PARCIAL
    // (`--limit` finito) — foi exatamente isso que reabriu incorretamente
    // o lote 2019-2020 como `incomplete` num teste manual. Reexecução
    // completa (sem `--limit`, para reconciliação/idempotência) continua
    // permitida — é sempre segura porque reprocessa 100% do esperado.
    if (existingBatch?.status === "complete" && LIMIT !== Infinity) {
      throw new Error(
        `O lote "${batch.key}" já está marcado como "complete". Uma execução parcial (--limit=${LIMIT}) reabriria o lote incorretamente (foi assim que um teste anterior corrompeu o status). Rode sem --limit para reconciliar/confirmar o lote inteiro, ou não rode --commit contra um lote já concluído.`,
      );
    }

    const expectedFields = {
      expected_articles: preflightSummary.eligibleArticles,
      expected_image_references: preflightSummary.totalImageReferences,
      expected_unique_images: preflightSummary.uniqueImageUrls,
    };
    if (existingBatch) {
      batchRowId = existingBatch.id;
      baseMetadata = existingBatch.metadata ?? {};
      await sb
        .from("legacy_migration_batches")
        .update({ status: "running", started_at: new Date().toISOString(), ...expectedFields })
        .eq("id", batchRowId);
    } else {
      const { data: created, error } = await sb
        .from("legacy_migration_batches")
        .insert({ batch_key: batch.key, period_start: batch.start, period_end: batch.end, status: "running", started_at: new Date().toISOString(), ...expectedFields })
        .select("id")
        .single();
      if (error) throw error;
      batchRowId = created.id;
    }
  }

  // Progresso (Fase 43, pedido explícito do usuário) — lote de ~5 mil
  // matérias podia rodar minutos sem nenhum sinal de vida no terminal.
  // Loga a cada PROGRESS_INTERVAL matérias (nunca por matéria — não é
  // escrita extra no banco além do checkpoint periódico já existente) e,
  // quando não é dry-run, atualiza `legacy_migration_batches.metadata`
  // fazendo MERGE com o que já existia (bloqueio 3 da revisão, Fase 43B —
  // a versão anterior sobrescrevia `metadata` inteiro a cada checkpoint,
  // criando uma janela em que histórico gravado antes do progresso
  // desaparecia). A reconciliação final (no fim da função) continua
  // gravando o resumo definitivo normalmente.
  const PROGRESS_INTERVAL = 50;
  const totalToProcess = Math.min(eligiblePairs.length, LIMIT);
  const startedAt = Date.now();

  // `attempted` conta TODA tentativa (sucesso ou falha) — bloqueio 2 da
  // revisão (Fase 43B): a versão anterior só incrementava `processed` em
  // caso de sucesso, então uma falha de artigo fazia `--limit`/%/ETA
  // ficarem incorretos (o loop nunca atingia o limite numérico esperado
  // e o progresso podia parecer travado). `imported`/`skippedExisting`/
  // `failedArticles` continuam sendo os contadores de RESULTADO, sem
  // mudança nenhuma no que já funcionava.
  async function logProgress(attempted) {
    const elapsedMs = Date.now() - startedAt;
    const elapsedSec = Math.round(elapsedMs / 1000);
    const pct = totalToProcess > 0 ? ((attempted / totalToProcess) * 100).toFixed(1) : "0.0";
    const imagesLinked = batchStats.uploadedImages + batchStats.reusedImages + batchStats.alreadyLinkedImages + batchStats.correctedImages;
    const etaSec = attempted > 0 ? Math.round((elapsedMs / attempted) * (totalToProcess - attempted) / 1000) : null;
    log(
      `  [progresso] ${attempted}/${totalToProcess} (${pct}%) — imagens ${imagesLinked}/${preflightSummary.totalImageReferences} — falhas: ${batchStats.failedArticles} artigo(s), ${batchStats.failedImages} imagem(ns) — decorrido: ${elapsedSec}s — ETA: ${etaSec === null ? "?" : `${etaSec}s`}`,
    );
    if (!dryRun && batchRowId) {
      await sb
        .from("legacy_migration_batches")
        .update({
          metadata: {
            ...baseMetadata,
            progress: {
              attemptedArticles: attempted,
              totalArticles: totalToProcess,
              percent: Number(pct),
              imagesLinked,
              imagesExpected: preflightSummary.totalImageReferences,
              failedArticles: batchStats.failedArticles,
              failedImages: batchStats.failedImages,
              elapsedSeconds: elapsedSec,
              etaSeconds: etaSec,
              updatedAt: new Date().toISOString(),
            },
          },
        })
        .eq("id", batchRowId);
    }
  }

  let attempted = 0;
  for (const { candidate: c, detail } of eligiblePairs) {
    if (attempted >= LIMIT) break;
    attempted += 1;
    try {
      await importCandidate(sb, c, detail, { sectionCache, localityId, throttle, log, dryRun, batchStats, imageExceptionsFile: IMAGE_EXCEPTIONS_FILE });
    } catch (error) {
      batchStats.failedArticles += 1;
      log(`  [ERRO] ${c.primary.url}: ${error.message}`);
    }
    if (attempted % PROGRESS_INTERVAL === 0) {
      await logProgress(attempted);
    }
  }
  if (attempted % PROGRESS_INTERVAL !== 0) {
    await logProgress(attempted);
  }

  log("\n== RESULTADO DA IMPORTAÇÃO ==");
  log(JSON.stringify(batchStats, null, 2));

  if (!dryRun && batchRowId && trackBatch) {
    // Reconciliação real (item 4 da Fase 35B / bloqueio 1 da revisão do
    // ChatGPT) — nunca "complete" só por failedArticles/failedImages
    // === 0. Precisa CONFERIR a quantidade real: todo elegível importado
    // OU já existente, e toda referência de imagem esperada efetivamente
    // contabilizada (upload + reuso + já vinculada + corrigida + falha
    // === total esperado) — nunca assumir isso por ausência de erro.
    const articlesAccountedFor = batchStats.imported + batchStats.skippedExisting;
    const articlesReconciled = articlesAccountedFor === preflightSummary.eligibleArticles && batchStats.failedArticles === 0;

    const linkedTotal = batchStats.uploadedImages + batchStats.reusedImages + batchStats.alreadyLinkedImages + batchStats.correctedImages;
    const imageReferencesAccounted = linkedTotal + batchStats.failedImages === preflightSummary.totalImageReferences;
    const imagesReconciled = imageReferencesAccounted && batchStats.failedImages === 0;

    const status = articlesReconciled && imagesReconciled ? "complete" : "incomplete";

    await sb
      .from("legacy_migration_batches")
      .update({
        status,
        imported_articles: batchStats.imported,
        skipped_existing: batchStats.skippedExisting,
        failed_articles: batchStats.failedArticles,
        migrated_images: batchStats.uploadedImages,
        reused_images: batchStats.reusedImages,
        failed_images: batchStats.failedImages,
        completed_at: new Date().toISOString(),
        metadata: {
          uploaded: batchStats.uploadedImages,
          reused: batchStats.reusedImages,
          alreadyLinked: batchStats.alreadyLinkedImages,
          corrected: batchStats.correctedImages,
          linkedTotal,
          expectedReferences: preflightSummary.totalImageReferences,
          failedOrPending: batchStats.failedImages,
          articlesReconciled,
          imageReferencesAccounted,
          imagesReconciled,
        },
      })
      .eq("id", batchRowId);
    log(
      `Lote marcado como: ${status} (artigos reconciliados: ${articlesReconciled}, imagens: ${linkedTotal}/${preflightSummary.totalImageReferences} vinculadas, ${batchStats.failedImages} falha(s)/pendente(s))`,
    );
  }
  return batchStats;
}

async function main() {
  await mkdir(batchDir, { recursive: true });
  const log = (...m) => console.log(...m);
  log(`== Fase 35 — motor de migração — lote ${batch.key} (${batch.start} a ${batch.end}) — modo=${MODE} commit=${COMMIT} ==`);

  const allItems = await loadInventory(INVENTORY_FILE);
  const candidates = dedupeByIdentity(allItems);
  const { eligible: batchRange, dateExceptions } = filterByBatchRange(candidates, batch);
  const inRange = batchRange.filter((candidate) => {
    const d = candidate.publishedIso;
    if (!d) return false;
    if (FROM_DATE && d < FROM_DATE) return false;
    if (TO_DATE && d > TO_DATE) return false;
    return true;
  });
  if (IS_INCREMENTAL) {
    log(`Escopo incremental: ${FROM_DATE ?? batch.start} a ${TO_DATE ?? batch.end} — sem alterar o status histórico do lote ${batch.key}.`);
  }
  log(`Candidatas no intervalo: ${inRange.length} | exceções de data: ${dateExceptions.length}`);

  const throttle = createRateLimiter(RPS);
  const cache = await ensureDetails(inRange, throttle, log);

  if (MODE === "preflight") {
    await runPreflight(inRange, dateExceptions, cache, log);
  } else if (MODE === "import") {
    // Sempre recalcula (barreira de integridade incluída) antes de gravar
    // — só o conjunto `eligibleList` (pós-barreira) pode ser importado.
    const { summary, eligibleList } = await runPreflight(inRange, dateExceptions, cache, log);
    await runImport(eligibleList, summary, log);
  } else {
    throw new Error(`Modo desconhecido: ${MODE}`);
  }
}

main().catch((error) => {
  console.error("Falha no motor de migração:", error);
  process.exitCode = 1;
});
