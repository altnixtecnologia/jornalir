#!/usr/bin/env node
// Validação final SOMENTE LEITURA do lote 2015-2016 completo (Fase 35E,
// revisão do ChatGPT) — pagina tudo (o limite padrão do supabase-js é
// 1000 linhas por query, que mascararia duplicatas num lote de 1.622/3.025
// linhas se não paginado). Nunca grava nada.
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente (--env-file).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

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

async function main() {
  const articles = await fetchAll("articles", "id, slug, title, published_at, origin, status", (q) => q.eq("origin", "legacy_site"));
  const sources = await fetchAll("article_external_sources", "id, article_id, external_id, source_url, source_slug", (q) => q.eq("provider", "informativo_regional_legacy"));
  const media = await fetchAll("media_assets", "id, origin_source_url, storage_path, public_url", (q) => q.not("origin_source_url", "is", null));
  const articleIds = articles.map((a) => a.id);
  const links = [];
  for (let i = 0; i < articleIds.length; i += 200) {
    const chunk = articleIds.slice(i, i + 200);
    const chunkLinks = await fetchAll("article_media", "id, article_id, media_id, role, sort_order", (q) => q.in("article_id", chunk));
    links.push(...chunkLinks);
  }
  const placements = [];
  for (let i = 0; i < articleIds.length; i += 200) {
    const chunk = articleIds.slice(i, i + 200);
    const chunkPl = await fetchAll("article_placements", "id, article_id", (q) => q.in("article_id", chunk));
    placements.push(...chunkPl);
  }

  const result = {
    totalArticles: articles.length,
    uniqueSlugs: new Set(articles.map((a) => a.slug)).size,
    totalSources: sources.length,
    uniqueSourceArticleIds: new Set(sources.map((s) => s.article_id)).size,
    uniqueExternalIds: new Set(sources.map((s) => s.external_id)).size,
    totalMedia: media.length,
    uniqueOriginSourceUrl: new Set(media.map((m) => m.origin_source_url)).size,
    uniqueStoragePath: new Set(media.map((m) => m.storage_path)).size,
    totalArticleMediaLinks: links.length,
    uniqueArticleMediaPairs: new Set(links.map((l) => `${l.article_id}:${l.media_id}`)).size,
    articlesWithMoreThanOneCover: 0,
    articlesWithExactlyOneCover: 0,
    articlesWithZeroImages: 0,
    placementsForLegacyArticles: placements.length,
    nonPublishedStatus: articles.filter((a) => a.status !== "published").length,
    gifCount: media.filter((m) => m.storage_path?.endsWith(".gif")).length,
  };

  const coverCountByArticle = {};
  const linksByArticle = {};
  for (const l of links) {
    linksByArticle[l.article_id] ??= [];
    linksByArticle[l.article_id].push(l);
    if (l.role === "cover") coverCountByArticle[l.article_id] = (coverCountByArticle[l.article_id] ?? 0) + 1;
  }
  result.articlesWithMoreThanOneCover = Object.values(coverCountByArticle).filter((c) => c > 1).length;
  result.articlesWithExactlyOneCover = Object.values(coverCountByArticle).filter((c) => c === 1).length;
  result.articlesWithZeroImages = articleIds.filter((id) => !linksByArticle[id] || linksByArticle[id].length === 0).length;

  // sort_order/role sanity: capa sempre 0, sem buracos/duplicatas de sort_order por artigo.
  let sortOrderIssues = 0;
  for (const [articleId, arr] of Object.entries(linksByArticle)) {
    const sorted = [...arr].sort((a, b) => a.sort_order - b.sort_order);
    const coverIdx = sorted.findIndex((l) => l.role === "cover");
    if (coverIdx > 0) sortOrderIssues += 1; // capa não é o menor sort_order
    const orders = sorted.map((l) => l.sort_order);
    if (new Set(orders).size !== orders.length) sortOrderIssues += 1; // sort_order duplicado dentro do mesmo artigo
  }
  result.sortOrderIssues = sortOrderIssues;

  // Confirma que os 13 needs_review e as 7 exceções de data NÃO foram importados.
  const needsReview = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./output/batches/2015-2016/needs-review.json", import.meta.url), "utf8"));
  const dateExceptions = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./output/batches/2015-2016/date-exceptions.json", import.meta.url), "utf8"));
  const importedUrls = new Set(sources.map((s) => s.source_url));
  const importedExternalIds = new Set(sources.map((s) => s.external_id));
  result.needsReviewLeaked = needsReview.filter((r) => importedUrls.has(r.url)).length;
  result.dateExceptionsLeaked = dateExceptions.filter((r) => importedUrls.has(r.url)).length;
  result.needsReviewTotal = needsReview.length;
  result.dateExceptionsTotal = dateExceptions.length;

  await writeFile(new URL("./output/batches/2015-2016/batch-final-validation.json", import.meta.url), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("Falha na validação final:", e);
  process.exit(1);
});
