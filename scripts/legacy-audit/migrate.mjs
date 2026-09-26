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
import { normalizeUrl, stableSlug, sourceHash, PROVIDER } from "./lib/identity.mjs";
import { getBatch, CATEGORY_TO_SECTION_SLUG } from "./lib/batches.mjs";
import { parseBrDateTime, toPublishedAtIso } from "./lib/dates.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, candidateKey, collectImageRefs, classifyCandidates } from "./lib/pipeline.mjs";

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

/**
 * Reconcilia as imagens esperadas de UMA matéria contra o que já existe
 * no banco (item 3, Fase 35B) — usado tanto para uma matéria nova quanto
 * para uma já existente reencontrada numa reexecução. Nunca duplica: só
 * copia/reutiliza o que ainda falta. Retorna contadores + o total de
 * vínculos existentes ao final (para a reconciliação do lote, item 4).
 */
async function reconcileArticleImages(sb, articleId, expectedRefs, { articleSlug, throttle, log, dryRun }) {
  const outcome = { uploaded: 0, reused: 0, alreadyLinked: 0, failed: 0, linksAfter: 0 };
  if (dryRun) {
    outcome.alreadyLinked = 0;
    return outcome;
  }

  const { data: existingLinks, error: linksErr } = await sb
    .from("article_media")
    .select("id, role, sort_order, media_assets(origin_source_url)")
    .eq("article_id", articleId);
  if (linksErr) throw linksErr;
  const linkedSourceUrls = new Set((existingLinks ?? []).map((l) => l.media_assets?.origin_source_url).filter(Boolean));

  let sortOrder = (existingLinks ?? []).length;
  for (const ref of expectedRefs) {
    const normalized = normalizeUrl(ref.src);
    if (linkedSourceUrls.has(normalized)) {
      outcome.alreadyLinked += 1;
      continue; // já migrada e já vinculada nesta matéria — nunca duplicar.
    }

    // Mídia pode já existir (baixada para OUTRA matéria) — reutilizar em
    // vez de baixar de novo (nunca copiar duas vezes a mesma imagem
    // externa, item 11).
    const { data: existingMedia, error: findErr } = await sb
      .from("media_assets")
      .select("id")
      .eq("origin_source_url", normalized)
      .maybeSingle();
    if (findErr) throw findErr;

    let mediaId = existingMedia?.id ?? null;
    if (mediaId) {
      outcome.reused += 1;
    } else {
      await throttle();
      const result = await downloadImage(ref.src);
      if (!result.ok) {
        await appendFile(
          IMAGE_EXCEPTIONS_FILE,
          JSON.stringify({ articleSlug, url: ref.src, status: result.status, error: result.error, at: new Date().toISOString() }) + "\n",
          "utf8",
        );
        log(`    [imagem falhou] ${ref.src} (${result.status || result.error})`);
        outcome.failed += 1;
        continue;
      }
      const ext = extFromContentType(result.contentType);
      const storagePath = `legacy/${articleSlug}/${sortOrder}.${ext}`;
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
        outcome.failed += 1;
        continue;
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
      mediaId = media.id;
      outcome.uploaded += 1;
    }

    const { error: linkErr } = await sb.from("article_media").insert({
      article_id: articleId,
      media_id: mediaId,
      role: ref.role,
      sort_order: sortOrder,
      caption_override: ref.caption || null,
      credit_override: ref.credit || null,
    });
    if (linkErr) throw linkErr;
    sortOrder += 1;
  }

  outcome.linksAfter = (existingLinks ?? []).length + outcome.uploaded + outcome.reused;
  return outcome;
}

/**
 * Cria (via RPC atômica, item 2) ou reencontra a matéria e SEMPRE
 * reconcilia as imagens (item 3) — nunca pula uma matéria já existente
 * sem checar se a mídia dela está completa.
 */
async function importCandidate(sb, c, detail, { sectionCache, localityId, throttle, log, dryRun, batchStats }) {
  const sectionSlug = CATEGORY_TO_SECTION_SLUG[c.primary.category];
  const slug = stableSlug(c.primary);
  const refs = detail ? collectImageRefs(detail) : [];

  const existingId = await findExistingArticleId(sb, c.identity);
  let articleId = existingId;
  let wasExisting = Boolean(existingId);

  if (dryRun) {
    log(`  [dry-run] ${wasExisting ? "reconciliaria" : "criaria"} matéria "${detail?.title || c.primary.title}" (${slug}) em ${sectionSlug}, imagens=${refs.length}`);
  } else if (!wasExisting) {
    const sectionId = await resolveSectionId(sb, sectionSlug, sectionCache);
    // Data/hora original preservada de verdade (item 1, Fase 35B) — nunca
    // um horário inventado. A precisão real (datetime vs. date_only) vai
    // em raw_metadata para nunca ficar escondida atrás do timestamp.
    const detailParsed = parseBrDateTime(detail?.publishedRaw) ?? { dateIso: c.publishedIso, time: null, precision: "date_only" };
    const publishedAtIso = toPublishedAtIso(detailParsed);
    const hash = sourceHash(c.primary, detail);

    const { data: newId, error: rpcErr } = await sb.rpc("legacy_import_article", {
      article: {
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
      },
      source: {
        provider: PROVIDER,
        external_id: c.identity.externalId,
        source_url: c.identity.normalizedUrl,
        source_slug: c.primary.slug,
        original_category: c.primary.category,
        original_subcategory: c.primary.category.startsWith("colunistas/") ? c.primary.category.split("/")[1] : null,
        original_author: detail?.sourceLabel || null,
        original_published_at: publishedAtIso,
        source_hash: hash,
        raw_metadata: {
          allCategories: c.allCategories,
          listingTitle: c.primary.title,
          listingDateRaw: c.primary.listingDateRaw,
          datePrecision: detailParsed.precision,
        },
      },
    });
    if (rpcErr) throw rpcErr;
    articleId = newId;
  }

  if (!dryRun) {
    const imgOutcome = await reconcileArticleImages(sb, articleId, refs, { articleSlug: slug, throttle, log, dryRun });
    batchStats.uploadedImages += imgOutcome.uploaded;
    batchStats.reusedImages += imgOutcome.reused;
    batchStats.alreadyLinkedImages += imgOutcome.alreadyLinked;
    batchStats.failedImages += imgOutcome.failed;
  }

  if (wasExisting) batchStats.skippedExisting += 1;
  else batchStats.imported += 1;
  return { status: wasExisting ? "reconciled_existing" : "imported", articleId };
}

// `eligiblePairs` já passou pela barreira de integridade (lib/integrity.mjs)
// — só chega aqui quem foi classificado como "eligible", nunca
// needs_review/quarantined/rejected (Fase 35, item explícito do usuário).
async function runImport(eligiblePairs, preflightSummary, log) {
  const dryRun = !COMMIT;
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
    failedImages: 0,
  };
  let batchRowId = null;

  if (!dryRun) {
    // Persiste o esperado do preflight (item 5) — a reconciliação final
    // (item 4) compara o banco contra ESTES números, nunca contra um
    // "sucesso" definido só por failedArticles === 0.
    const { data: existingBatch } = await sb.from("legacy_migration_batches").select("id").eq("batch_key", batch.key).maybeSingle();
    const expectedFields = {
      expected_articles: preflightSummary.eligibleArticles,
      expected_image_references: preflightSummary.totalImageReferences,
      expected_unique_images: preflightSummary.uniqueImageUrls,
    };
    if (existingBatch) {
      batchRowId = existingBatch.id;
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

  let processed = 0;
  for (const { candidate: c, detail } of eligiblePairs) {
    if (processed >= LIMIT) break;
    try {
      await importCandidate(sb, c, detail, { sectionCache, localityId, throttle, log, dryRun, batchStats });
      processed += 1;
    } catch (error) {
      batchStats.failedArticles += 1;
      log(`  [ERRO] ${c.primary.url}: ${error.message}`);
    }
  }

  log("\n== RESULTADO DA IMPORTAÇÃO ==");
  log(JSON.stringify(batchStats, null, 2));

  if (!dryRun && batchRowId) {
    // Reconciliação real (item 4) — nunca "complete" só por
    // failedArticles === 0. Artigos: todo elegível precisa estar
    // importado OU já existente, e zero falhas. Imagens: toda referência
    // esperada precisa estar coberta (upload OU reuso OU já vinculada) —
    // qualquer falha de imagem mantém o lote incomplete/pendente de mídia.
    const articlesAccountedFor = batchStats.imported + batchStats.skippedExisting;
    const articlesReconciled = articlesAccountedFor === preflightSummary.eligibleArticles && batchStats.failedArticles === 0;
    const imagesReconciled = batchStats.failedImages === 0;
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
          alreadyLinkedImages: batchStats.alreadyLinkedImages,
          articlesReconciled,
          imagesReconciled,
        },
      })
      .eq("id", batchRowId);
    log(`Lote marcado como: ${status} (artigos reconciliados: ${articlesReconciled}, imagens reconciliadas: ${imagesReconciled})`);
  }
  return batchStats;
}

async function main() {
  await mkdir(batchDir, { recursive: true });
  const log = (...m) => console.log(...m);
  log(`== Fase 35 — motor de migração — lote ${batch.key} (${batch.start} a ${batch.end}) — modo=${MODE} commit=${COMMIT} ==`);

  const allItems = await loadInventory(INVENTORY_FILE);
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
