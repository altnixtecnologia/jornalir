#!/usr/bin/env node
// Validação final SOMENTE LEITURA de UM lote (Fase 37, revisão do
// ChatGPT: generalizado de 2015-2016 para --batch=<key> — o validador
// anterior consultava TODO origin=legacy_site, o que misturaria lotes
// diferentes a partir do segundo). Pagina tudo (supabase-js limita a
// 1.000 linhas por query por padrão). Nunca grava nada.
//
// Uso: node batch-final-validate.mjs --batch=2017-2018
//
// Duas camadas de checagem:
//   1) ESCOPADA NO LOTE: conta só as identidades esperadas deste lote
//      (calculadas do mesmo pipeline/preflight) — não confunde com outros
//      lotes já migrados.
//   2) GLOBAL: duplicidade (slug/external_id/origin_source_url) em TODO
//      o conteúdo origin=legacy_site, não só deste lote — uma duplicata
//      entre lotes diferentes só apareceria aqui.
import { createClient } from "@supabase/supabase-js";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBatch } from "./lib/batches.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, classifyCandidates, loadDetailCache } from "./lib/pipeline.mjs";
import { normalizeUrl, PROVIDER } from "./lib/identity.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const BATCH_KEY = args.batch;
if (!BATCH_KEY) {
  console.error("Uso: node batch-final-validate.mjs --batch=2017-2018");
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente (--env-file).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const batch = getBatch(BATCH_KEY);
const batchDir = path.join(AUDIT_DIR, "output", "batches", BATCH_KEY);
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");
const DETAIL_CACHE_FILE = path.join(batchDir, "details.ndjson");

async function fetchAll(table, select, filterFn) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  for (;;) {
    let query = sb.from(table).select(select).range(from, from + pageSize - 1);
    if (filterFn) query = filterFn(query);
    const { data, error } = await query;
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchAllChunked(table, select, ids, idColumn = "article_id") {
  const all = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = await fetchAll(table, select, (q) => q.in(idColumn, chunk));
    all.push(...rows);
  }
  return all;
}

async function main() {
  // Identidades esperadas DESTE lote (mesmo pipeline usado pelo preflight/import).
  const allItems = await loadInventory(INVENTORY_FILE);
  const candidates = dedupeByIdentity(allItems);
  const { eligible: inRange } = filterByBatchRange(candidates, batch);
  const cache = await loadDetailCache(DETAIL_CACHE_FILE);
  const { eligibleList } = classifyCandidates(inRange, cache);
  const expectedExternalIds = new Set(eligibleList.map((e) => e.candidate.identity.externalId).filter(Boolean));
  const expectedSourceUrls = new Set(eligibleList.map((e) => e.candidate.identity.normalizedUrl));

  // TODAS as sources do provider (global) — usado tanto para escopar este
  // lote quanto para a checagem global de duplicidade entre lotes.
  const allSources = await fetchAll("article_external_sources", "id, article_id, external_id, source_url, source_slug", (q) => q.eq("provider", PROVIDER));

  const batchSources = allSources.filter((s) => (s.external_id && expectedExternalIds.has(s.external_id)) || (s.source_url && expectedSourceUrls.has(s.source_url)));
  const batchArticleIds = batchSources.map((s) => s.article_id);

  const batchArticles = await fetchAllChunked("articles", "id, slug, title, published_at, origin, status", batchArticleIds, "id");
  const batchLinks = await fetchAllChunked("article_media", "id, article_id, media_id, role, sort_order, media_assets(origin_source_url, storage_path)", batchArticleIds);
  const batchPlacements = await fetchAllChunked("article_placements", "id, article_id", batchArticleIds);

  const mediaIds = [...new Set(batchLinks.map((l) => l.media_id))];
  const batchMedia = await fetchAllChunked("media_assets", "id, origin_source_url, storage_path, public_url", mediaIds, "id");

  const linksByArticle = {};
  const coverCountByArticle = {};
  for (const l of batchLinks) {
    linksByArticle[l.article_id] ??= [];
    linksByArticle[l.article_id].push(l);
    if (l.role === "cover") coverCountByArticle[l.article_id] = (coverCountByArticle[l.article_id] ?? 0) + 1;
  }
  let sortOrderIssues = 0;
  for (const arr of Object.values(linksByArticle)) {
    const sorted = [...arr].sort((a, b) => a.sort_order - b.sort_order);
    if (sorted.findIndex((l) => l.role === "cover") > 0) sortOrderIssues += 1;
    const orders = sorted.map((l) => l.sort_order);
    if (new Set(orders).size !== orders.length) sortOrderIssues += 1;
  }

  const needsReview = JSON.parse(await readFile(path.join(batchDir, "needs-review.json"), "utf8"));
  const dateExceptions = JSON.parse(await readFile(path.join(batchDir, "date-exceptions.json"), "utf8"));
  const batchSourceUrls = new Set(batchSources.map((s) => s.source_url));

  const batchScoped = {
    batch: BATCH_KEY,
    expectedArticles: eligibleList.length,
    foundArticles: batchArticles.length,
    foundSources: batchSources.length,
    uniqueSlugsInBatch: new Set(batchArticles.map((a) => a.slug)).size,
    foundMedia: batchMedia.length,
    foundArticleMediaLinks: batchLinks.length,
    nonPublishedStatus: batchArticles.filter((a) => a.status !== "published").length,
    placementsForBatchArticles: batchPlacements.length,
    articlesWithMoreThanOneCover: Object.values(coverCountByArticle).filter((c) => c > 1).length,
    articlesWithExactlyOneCover: Object.values(coverCountByArticle).filter((c) => c === 1).length,
    articlesWithZeroImages: batchArticleIds.filter((id) => !linksByArticle[id] || linksByArticle[id].length === 0).length,
    sortOrderIssues,
    needsReviewTotal: needsReview.length,
    needsReviewLeaked: needsReview.filter((r) => batchSourceUrls.has(normalizeUrl(r.url))).length,
    dateExceptionsTotal: dateExceptions.length,
    dateExceptionsLeaked: dateExceptions.filter((r) => batchSourceUrls.has(normalizeUrl(r.url))).length,
    gifCount: batchMedia.filter((m) => m.storage_path?.endsWith(".gif")).length,
  };

  // Checagem GLOBAL (todos os lotes já migrados, não só este) — duplicidade
  // nunca pode existir entre lotes diferentes.
  const allMedia = await fetchAll("media_assets", "id, origin_source_url, storage_path", (q) => q.not("origin_source_url", "is", null));
  const allArticles = await fetchAll("articles", "id, slug", (q) => q.eq("origin", "legacy_site"));
  const globalChecks = {
    totalArticlesAllBatches: allArticles.length,
    uniqueSlugsAllBatches: new Set(allArticles.map((a) => a.slug)).size,
    totalSourcesAllBatches: allSources.length,
    uniqueExternalIdsAllBatches: new Set(allSources.map((s) => s.external_id).filter(Boolean)).size,
    uniqueSourceUrlsAllBatches: new Set(allSources.map((s) => s.source_url).filter(Boolean)).size,
    totalMediaAllBatches: allMedia.length,
    uniqueOriginSourceUrlAllBatches: new Set(allMedia.map((m) => m.origin_source_url)).size,
    uniqueStoragePathAllBatches: new Set(allMedia.map((m) => m.storage_path)).size,
  };

  const result = { batchScoped, globalChecks };
  await writeFile(path.join(batchDir, "batch-final-validation.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("Falha na validação final:", e);
  process.exit(1);
});
