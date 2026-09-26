#!/usr/bin/env node
// Motor de migração do legado por lotes (Fase 35). Reaproveita o coletor
// da Fase 34 (lib/http.mjs, lib/parse.mjs). Dois modos:
//   --mode=preflight (padrão): calcula o esperado do lote, não grava nada.
//   --mode=import: grava de verdade — exige --commit explícito e
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no ambiente. Sem --commit,
//     roda em dry-run (simula, loga o que faria, não grava).
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchText, createRateLimiter } from "./lib/http.mjs";
import { parseArticlePage } from "./lib/parse.mjs";
import { normalizeUrl, externalIdentity, stableSlug, sourceHash, PROVIDER } from "./lib/identity.mjs";
import { getBatch, CATEGORY_PRIORITY, CATEGORY_TO_SECTION_SLUG } from "./lib/batches.mjs";
import { assessArticleIntegrity } from "./lib/integrity.mjs";

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

if (!BATCH_KEY) {
  console.error("Uso: node migrate.mjs --batch=2015-2016 [--mode=preflight|import] [--commit] [--limit=N] [--rps=4]");
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

function parseListingDate(raw) {
  const m = (raw || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  if (iso === "1969-12-31" || iso === "1970-01-01") return { iso, isBug: true };
  return { iso, isBug: false };
}

async function loadInventory() {
  const raw = await readFile(INVENTORY_FILE, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/** Agrupa itens de listagem pela mesma identidade externa (item 5): a
 * mesma matéria pode ter aparecido em mais de uma categoria — vira UMA
 * candidata só, com todas as categorias preservadas em `allCategories`. */
function dedupeByIdentity(items) {
  const byIdentity = new Map();
  for (const item of items) {
    const identity = externalIdentity(item);
    const key = identity.externalId ? `id:${identity.externalId}` : `url:${identity.normalizedUrl}`;
    if (!byIdentity.has(key)) {
      byIdentity.set(key, { identity, items: [item] });
    } else {
      byIdentity.get(key).items.push(item);
    }
  }
  const candidates = [];
  for (const { identity, items: group } of byIdentity.values()) {
    const primary = [...group].sort(
      (a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category),
    )[0];
    const allCategories = [...new Set(group.map((g) => g.category))];
    candidates.push({ identity, primary, allCategories, listingItems: group });
  }
  return candidates;
}

function filterByBatchRange(candidates, batch) {
  const eligible = [];
  const dateExceptions = [];
  const outOfRange = [];
  for (const c of candidates) {
    const parsed = parseListingDate(c.primary.listingDateRaw);
    if (!parsed) {
      outOfRange.push(c);
      continue;
    }
    if (parsed.isBug) {
      dateExceptions.push({ ...c, rawDate: c.primary.listingDateRaw });
      continue;
    }
    if (parsed.iso >= batch.start && parsed.iso <= batch.end) {
      eligible.push({ ...c, publishedIso: parsed.iso });
    } else {
      outOfRange.push(c);
    }
  }
  return { eligible, dateExceptions, outOfRange };
}

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

function candidateKey(c) {
  return c.identity.externalId ? `id:${c.identity.externalId}` : `url:${c.identity.normalizedUrl}`;
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

function collectImageRefs(detail) {
  const refs = [];
  if (detail.coverUrl) refs.push({ role: "cover", src: detail.coverUrl, caption: detail.coverCaption, credit: null });
  for (const g of detail.galleryImages ?? []) {
    if (g.src === detail.coverUrl) continue;
    refs.push({ role: "gallery", src: g.src, caption: g.caption, credit: g.credit });
  }
  return refs;
}

/**
 * Classifica cada candidata do lote em eligible/needs_review/rejected
 * (barreira de integridade editorial — nunca importar automaticamente
 * algo ambíguo; ver lib/integrity.mjs) e só então calcula as contagens
 * do preflight (item 9) EXCLUSIVAMENTE sobre o conjunto `eligible`.
 */
async function runPreflight(eligible, dateExceptions, cache, log) {
  const eligibleList = [];
  const needsReviewList = [];
  const rejectedList = [];

  for (const c of eligible) {
    const key = candidateKey(c);
    const detail = cache.get(key);
    const { verdict, reasons } = assessArticleIntegrity(c, detail);
    const record = {
      url: c.primary.url,
      title: detail?.title || c.primary.title,
      category: c.primary.category,
      allCategories: c.allCategories,
      publishedIso: c.publishedIso,
      reasons,
    };
    if (verdict === "eligible") eligibleList.push({ candidate: c, detail });
    else if (verdict === "needs_review") needsReviewList.push(record);
    else rejectedList.push(record);
  }

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

  log("\n== PREFLIGHT " + batch.key + " ==");
  log(JSON.stringify(summary, null, 2));
  log(`\nExceções de data (fora da carga automática): ${dateExceptions.length} -> ${EXCEPTIONS_FILE}`);
  log(`Precisam de revisão manual (não importadas automaticamente): ${needsReviewList.length} -> ${NEEDS_REVIEW_FILE}`);
  log(`Rejeitadas (falha de busca): ${rejectedList.length} -> ${REJECTED_FILE}`);
  return { summary, eligibleList, needsReviewList, rejectedList };
}

// ---- modo import ----

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente para --mode=import --commit.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function downloadImage(url, { retries = 3, timeoutMs = 20000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, status: res.status };
      const contentType = res.headers.get("content-type") || "application/octet-stream";
      if (!contentType.startsWith("image/")) return { ok: false, status: 0, error: `mime inesperado: ${contentType}` };
      const buffer = Buffer.from(await res.arrayBuffer());
      return { ok: true, buffer, contentType };
    } catch (error) {
      clearTimeout(timer);
      if (attempt === retries) return { ok: false, status: 0, error: String(error) };
    }
  }
  return { ok: false, status: 0, error: "retries exhausted" };
}

function extFromContentType(ct) {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

async function resolveSectionId(sb, slug, sectionCache) {
  if (sectionCache.has(slug)) return sectionCache.get(slug);
  const { data, error } = await sb.from("editorial_sections").select("id").eq("slug", slug).single();
  if (error || !data) throw new Error(`Editoria não encontrada para slug=${slug}: ${error?.message}`);
  sectionCache.set(slug, data.id);
  return data.id;
}

async function resolveGeralLocalityId(sb) {
  const { data, error } = await sb.from("localities").select("id").eq("slug", "geral").single();
  if (error || !data) throw new Error(`Localidade "geral" não encontrada: ${error?.message}`);
  return data.id;
}

async function findExistingArticleId(sb, identity) {
  let query = sb.from("article_external_sources").select("article_id").eq("provider", PROVIDER);
  if (identity.externalId) query = query.eq("external_id", identity.externalId);
  else query = query.eq("source_url", identity.normalizedUrl);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.article_id ?? null;
}

async function reuseOrUploadImage(sb, ref, { articleSlug, throttle, log, imgIndex, dryRun }) {
  const normalized = normalizeUrl(ref.src);
  const { data: existing, error: findErr } = await sb
    .from("media_assets")
    .select("id, public_url")
    .eq("origin_source_url", normalized)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return { mediaId: existing.id, reused: true };

  await throttle();
  const result = await downloadImage(ref.src);
  if (!result.ok) {
    await appendFile(
      IMAGE_EXCEPTIONS_FILE,
      JSON.stringify({ articleSlug, url: ref.src, status: result.status, error: result.error, at: new Date().toISOString() }) + "\n",
      "utf8",
    );
    log(`    [imagem falhou] ${ref.src} (${result.status || result.error})`);
    return { mediaId: null, reused: false, failed: true };
  }

  if (dryRun) {
    return { mediaId: "dry-run", reused: false, uploaded: true };
  }

  const ext = extFromContentType(result.contentType);
  const storagePath = `legacy/${articleSlug}/${imgIndex}.${ext}`;
  const { error: uploadErr } = await sb.storage
    .from("article-media")
    .upload(storagePath, result.buffer, { contentType: result.contentType, upsert: true });
  if (uploadErr) {
    await appendFile(
      IMAGE_EXCEPTIONS_FILE,
      JSON.stringify({ articleSlug, url: ref.src, error: uploadErr.message, at: new Date().toISOString() }) + "\n",
      "utf8",
    );
    log(`    [upload falhou] ${ref.src}: ${uploadErr.message}`);
    return { mediaId: null, reused: false, failed: true };
  }
  const { data: pub } = sb.storage.from("article-media").getPublicUrl(storagePath);

  const { data: media, error: insertErr } = await sb
    .from("media_assets")
    .insert({
      type: "image",
      file_name: storagePath.split("/").pop(),
      storage_path: storagePath,
      public_url: pub.publicUrl,
      title: articleSlug,
      caption: ref.caption || null,
      credit: ref.credit || null,
      origin_source_url: normalized,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;
  return { mediaId: media.id, reused: false, uploaded: true };
}

async function importCandidate(sb, c, detail, { sectionCache, localityId, throttle, log, dryRun, batchStats }) {
  const key = candidateKey(c);
  const existingId = await findExistingArticleId(sb, c.identity);
  if (existingId) {
    batchStats.skippedExisting += 1;
    return { status: "skipped_existing", articleId: existingId };
  }

  const sectionSlug = CATEGORY_TO_SECTION_SLUG[c.primary.category];
  const sectionId = await resolveSectionId(sb, sectionSlug, sectionCache);
  const slug = stableSlug(c.primary);
  const publishedAtIso = `${c.publishedIso}T12:00:00Z`;
  const hash = sourceHash(c.primary, detail);

  const articlePayload = {
    slug,
    title: detail?.title || c.primary.title,
    subtitle: detail?.subtitle || null,
    body: detail?.bodyHtml || "",
    section_id: sectionId,
    locality_id: localityId,
    status: "published",
    origin: "legacy_site",
    published_at: publishedAtIso,
    author_name: detail?.sourceLabel || null,
  };

  if (dryRun) {
    log(`  [dry-run] criaria matéria "${articlePayload.title}" (${slug}) em ${sectionSlug}`);
  } else {
    const { data: article, error: articleErr } = await sb.from("articles").insert(articlePayload).select("id").single();
    if (articleErr) throw articleErr;

    const { error: sourceErr } = await sb.from("article_external_sources").insert({
      article_id: article.id,
      provider: PROVIDER,
      external_id: c.identity.externalId,
      source_url: c.identity.normalizedUrl,
      source_slug: c.primary.slug,
      original_category: c.primary.category,
      original_subcategory: c.primary.category.startsWith("colunistas/") ? c.primary.category.split("/")[1] : null,
      original_author: detail?.sourceLabel || null,
      original_published_at: publishedAtIso,
      source_hash: hash,
      raw_metadata: { allCategories: c.allCategories, listingTitle: c.primary.title, listingDateRaw: c.primary.listingDateRaw },
    });
    if (sourceErr) throw sourceErr;

    const refs = detail ? collectImageRefs(detail) : [];
    let sortOrder = 0;
    for (const ref of refs) {
      const result = await reuseOrUploadImage(sb, ref, { articleSlug: slug, throttle, log, imgIndex: sortOrder, dryRun });
      if (result.failed) {
        batchStats.failedImages += 1;
        continue;
      }
      if (result.reused) batchStats.reusedImages += 1;
      else batchStats.migratedImages += 1;

      const { error: linkErr } = await sb.from("article_media").insert({
        article_id: article.id,
        media_id: result.mediaId,
        role: ref.role,
        sort_order: sortOrder,
        caption_override: ref.caption || null,
        credit_override: ref.credit || null,
      });
      if (linkErr) throw linkErr;
      sortOrder += 1;
    }
  }

  batchStats.imported += 1;
  return { status: "imported" };
}

// `eligiblePairs` já passou pela barreira de integridade (lib/integrity.mjs)
// — só chega aqui quem foi classificado como "eligible", nunca
// needs_review/rejected (Fase 35, item explícito do usuário).
async function runImport(eligiblePairs, log) {
  const dryRun = !COMMIT;
  log(dryRun ? "\n== MODO IMPORT (dry-run — nenhuma gravação real) ==" : "\n== MODO IMPORT (--commit, gravando de verdade) ==");

  const sb = dryRun ? null : supabaseAdmin();
  const sectionCache = new Map();
  const localityId = dryRun ? "dry-run" : await resolveGeralLocalityId(sb);
  const throttle = createRateLimiter(RPS);

  const batchStats = { imported: 0, skippedExisting: 0, failedArticles: 0, migratedImages: 0, reusedImages: 0, failedImages: 0 };
  let batchRowId = null;

  if (!dryRun) {
    const { data: existingBatch } = await sb.from("legacy_migration_batches").select("id").eq("batch_key", batch.key).maybeSingle();
    if (existingBatch) {
      batchRowId = existingBatch.id;
      await sb.from("legacy_migration_batches").update({ status: "running", started_at: new Date().toISOString() }).eq("id", batchRowId);
    } else {
      const { data: created, error } = await sb
        .from("legacy_migration_batches")
        .insert({ batch_key: batch.key, period_start: batch.start, period_end: batch.end, status: "running", started_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw error;
      batchRowId = created.id;
    }
  }

  let processed = 0;
  for (const { candidate: c, detail } of eligiblePairs) {
    if (processed >= LIMIT) break;
    try {
      const result = dryRun
        ? await (async () => {
            const existingId = null; // dry-run não consulta o banco
            if (existingId) return { status: "skipped_existing" };
            const sectionSlug = CATEGORY_TO_SECTION_SLUG[c.primary.category];
            log(`  [dry-run] "${detail?.title || c.primary.title}" -> editoria=${sectionSlug} slug=${stableSlug(c.primary)} imagens=${detail ? collectImageRefs(detail).length : 0}`);
            batchStats.imported += 1;
            return { status: "imported" };
          })()
        : await importCandidate(sb, c, detail, { sectionCache, localityId, throttle, log, dryRun: false, batchStats });
      processed += 1;
    } catch (error) {
      batchStats.failedArticles += 1;
      log(`  [ERRO] ${c.primary.url}: ${error.message}`);
    }
  }

  log("\n== RESULTADO DA IMPORTAÇÃO ==");
  log(JSON.stringify(batchStats, null, 2));

  if (!dryRun && batchRowId) {
    const status = batchStats.failedArticles === 0 ? "complete" : "incomplete";
    await sb
      .from("legacy_migration_batches")
      .update({
        status,
        imported_articles: batchStats.imported,
        skipped_existing: batchStats.skippedExisting,
        failed_articles: batchStats.failedArticles,
        migrated_images: batchStats.migratedImages,
        reused_images: batchStats.reusedImages,
        failed_images: batchStats.failedImages,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchRowId);
    log(`Lote marcado como: ${status}`);
  }
  return batchStats;
}

async function main() {
  await mkdir(batchDir, { recursive: true });
  const log = (...m) => console.log(...m);
  log(`== Fase 35 — motor de migração — lote ${batch.key} (${batch.start} a ${batch.end}) — modo=${MODE} commit=${COMMIT} ==`);

  const allItems = await loadInventory();
  const candidates = dedupeByIdentity(allItems);
  const { eligible: inRange, dateExceptions } = filterByBatchRange(candidates, batch);
  log(`Candidatas no intervalo: ${inRange.length} | exceções de data: ${dateExceptions.length}`);

  const throttle = createRateLimiter(RPS);
  const cache = await ensureDetails(inRange, throttle, log);

  if (MODE === "preflight") {
    await runPreflight(inRange, dateExceptions, cache, log);
  } else if (MODE === "import") {
    // Sempre recalcula (barreira de integridade incluída) antes de gravar
    // — só o conjunto `eligibleList` (pós-barreira) pode ser importado.
    const { eligibleList } = await runPreflight(inRange, dateExceptions, cache, log);
    await runImport(eligibleList, log);
  } else {
    throw new Error(`Modo desconhecido: ${MODE}`);
  }
}

main().catch((error) => {
  console.error("Falha no motor de migração:", error);
  process.exitCode = 1;
});
