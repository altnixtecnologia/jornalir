#!/usr/bin/env node
// Validação SOMENTE LEITURA do canário de 20 matérias (Fase 35C, revisão
// do ChatGPT) — confere DIRETO no Supabase, não nos contadores do
// script. Nunca grava nada. Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// no ambiente (nunca imprime a chave).
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import { normalizeUrl } from "./lib/identity.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, classifyCandidates, collectImageRefs, loadDetailCache } from "./lib/pipeline.mjs";
import { getBatch } from "./lib/batches.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente (--env-file).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const batch = getBatch("2015-2016");
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");
const DETAIL_CACHE_FILE = path.join(AUDIT_DIR, "output", "batches", "2015-2016", "details.ndjson");

async function main() {
  // Recalcula a mesma lista de 20 candidatas que o importador usaria
  // (mesma ordem determinística) para comparar expectativa vs. banco.
  const allItems = await loadInventory(INVENTORY_FILE);
  const candidates = dedupeByIdentity(allItems);
  const { eligible: inRange } = filterByBatchRange(candidates, batch);
  const cache = await loadDetailCache(DETAIL_CACHE_FILE);
  const { eligibleList } = classifyCandidates(inRange, cache);
  const expectedFirst20 = eligibleList.slice(0, 20);

  const { data: articles, error: artErr } = await sb
    .from("articles")
    .select("id, slug, title, subtitle, body, section_id, locality_id, status, origin, published_at, author_name, editorial_sections(slug), localities(slug)")
    .eq("origin", "legacy_site")
    .order("created_at", { ascending: true });
  if (artErr) throw artErr;

  const { data: sources, error: srcErr } = await sb
    .from("article_external_sources")
    .select("article_id, provider, external_id, source_url, source_slug, original_category, original_published_at, original_author, raw_metadata")
    .eq("provider", "informativo_regional_legacy");
  if (srcErr) throw srcErr;
  const sourceByArticleId = new Map(sources.map((s) => [s.article_id, s]));

  const { data: placements, error: plErr } = await sb.from("article_placements").select("article_id");
  if (plErr) throw plErr;
  const placedArticleIds = new Set((placements ?? []).map((p) => p.article_id));

  const { data: mediaLinks, error: mlErr } = await sb
    .from("article_media")
    .select("article_id, role, sort_order, caption_override, credit_override, media_assets(id, storage_path, public_url, origin_source_url)")
    .in(
      "article_id",
      articles.map((a) => a.id),
    );
  if (mlErr) throw mlErr;
  const mediaByArticleId = new Map();
  for (const link of mediaLinks) {
    if (!mediaByArticleId.has(link.article_id)) mediaByArticleId.set(link.article_id, []);
    mediaByArticleId.get(link.article_id).push(link);
  }

  const BUCKET = "article-media";
  const findings = [];
  let allOk = true;

  for (const article of articles) {
    const source = sourceByArticleId.get(article.id);
    const links = (mediaByArticleId.get(article.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const issues = [];

    if (!source) issues.push("sem article_external_sources");
    else if (sources.filter((s) => s.article_id === article.id).length !== 1) issues.push("mais de 1 article_external_sources");

    if (article.origin !== "legacy_site") issues.push(`origin inesperado: ${article.origin}`);
    if (article.localities?.slug !== "geral") issues.push(`localidade inesperada: ${article.localities?.slug}`);
    if (placedArticleIds.has(article.id)) issues.push("TEM placement (não deveria ter nenhuma)");

    const suspicious = /class="sidebar|class="widget|menu-item|class="footer|recomendad|relacionad|publicidade|ts-grid-box|carousel-item/i.test(article.body || "");
    if (suspicious) issues.push("body contém marcação suspeita de bloco não-editorial");

    const expected = expectedFirst20.find((e) => (source?.external_id && e.candidate.identity.externalId === source.external_id) || (source?.source_url && e.candidate.identity.normalizedUrl === source.source_url));
    let expectedRefs = [];
    if (expected) {
      expectedRefs = collectImageRefs(expected.detail);
      if (article.title !== (expected.detail?.title || expected.candidate.primary.title)) issues.push("título não corresponde ao legado");
      const expectedDateIso = expected.candidate.publishedIso;
      const actualDateIso = article.published_at ? article.published_at.slice(0, 10) : null;
      if (actualDateIso !== expectedDateIso) issues.push(`data divergente: esperado ${expectedDateIso}, gravado ${actualDateIso}`);
    } else {
      issues.push("não encontrado entre as 20 primeiras elegíveis esperadas (ordem pode ter mudado)");
    }

    if (links.length !== expectedRefs.length) issues.push(`quantidade de imagens diverge: esperado ${expectedRefs.length}, encontrado ${links.length}`);

    const coverLinks = links.filter((l) => l.role === "cover");
    if (expectedRefs.some((r) => r.role === "cover") && coverLinks.length !== 1) issues.push(`quantidade de capa inesperada: ${coverLinks.length}`);
    if (coverLinks[0] && coverLinks[0].sort_order !== 0) issues.push(`capa com sort_order !== 0: ${coverLinks[0].sort_order}`);

    for (let i = 0; i < expectedRefs.length; i += 1) {
      const exp = expectedRefs[i];
      const got = links[i];
      if (!got) continue;
      if (got.role !== exp.role) issues.push(`imagem #${i}: role esperado ${exp.role}, encontrado ${got.role}`);
      if (got.sort_order !== i) issues.push(`imagem #${i}: sort_order esperado ${i}, encontrado ${got.sort_order}`);
      const gotNormalized = got.media_assets?.origin_source_url;
      if (gotNormalized !== normalizeUrl(exp.src)) issues.push(`imagem #${i}: origin_source_url não corresponde à imagem antiga original`);
      if (!got.media_assets?.public_url?.includes(BUCKET)) issues.push(`imagem #${i}: public_url não aponta para o Storage próprio (${got.media_assets?.public_url})`);
    }

    for (const link of links) {
      if (!link.media_assets?.storage_path) {
        issues.push(`vínculo sem storage_path (media_assets.id=${link.media_assets?.id})`);
        continue;
      }
      const { data: exists, error: existsErr } = await sb.storage.from(BUCKET).list(link.media_assets.storage_path.split("/").slice(0, -1).join("/"));
      if (existsErr) issues.push(`erro ao checar Storage: ${existsErr.message}`);
      else {
        const fileName = link.media_assets.storage_path.split("/").pop();
        if (!exists.some((f) => f.name === fileName)) issues.push(`objeto não encontrado no Storage: ${link.media_assets.storage_path}`);
      }
    }

    if (issues.length > 0) allOk = false;
    findings.push({
      articleId: article.id,
      slug: article.slug,
      title: article.title,
      externalId: source?.external_id ?? null,
      sourceUrl: source?.source_url ?? null,
      editoria: article.editorial_sections?.slug,
      publishedAt: article.published_at,
      imageCount: links.length,
      issues,
    });
  }

  await writeFile(path.join(AUDIT_DIR, "output", "batches", "2015-2016", "canary-validation.json"), JSON.stringify({ allOk, totalArticles: articles.length, totalImageLinks: mediaLinks.length, findings }, null, 2), "utf8");
  console.log(JSON.stringify({ allOk, totalArticles: articles.length, totalImageLinks: mediaLinks.length }, null, 2));
  for (const f of findings) {
    if (f.issues.length > 0) console.log(`[PROBLEMA] ${f.slug}: ${f.issues.join(" | ")}`);
  }
  if (allOk) console.log("\nTodas as 20 matérias e suas imagens passaram na validação direta do banco.");
}

main().catch((e) => {
  console.error("Falha na validação:", e);
  process.exit(1);
});
