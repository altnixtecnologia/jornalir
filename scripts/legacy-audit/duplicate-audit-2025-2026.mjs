#!/usr/bin/env node
// Fase 46C — auditoria de candidatos a duplicata APÓS a carga real de
// 2025-2026 (último lote cronológico), SOMENTE LEITURA (nunca apaga,
// mescla, arquiva ou altera nada — só classifica). Reaproveita a mesma
// lógica/regra editorial (título sozinho nunca decide; título+data é só
// candidato; confirmação exige corpo idêntico ou quase idêntico), agora
// sobre TODOS os 6 lotes (23.292 articles) e distinguindo:
//   - grupos JÁ RESOLVIDOS (Fase 43: 54; Fase 44F: +10; Fase 45C: +1 —
//     1 published + resto archived, resultado esperado das limpezas);
//   - candidatos NOVOS envolvendo 2025-2026 (>=2 published no grupo);
//   - candidatos não resolvidos fora de 2025-2026 (deveria refletir só
//     os 13 candidatos antigos ainda pendentes de inspeção manual).
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

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

function normalizeTitle(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeBody(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sha1(input) {
  return createHash("sha1").update(input).digest("hex");
}

function batchOf(year) {
  if (year >= 2025) return "2025-2026";
  if (year >= 2023) return "2023-2024";
  if (year >= 2021) return "2021-2022";
  if (year >= 2019) return "2019-2020";
  if (year >= 2017) return "2017-2018";
  return "2015-2016";
}

async function main() {
  console.log("Carregando todos os articles legacy_site (6 lotes, paginado)...");
  const articles = await fetchAll(
    "articles",
    "id, slug, title, subtitle, body, status, archived_at, published_at, editorial_sections(slug,name)",
    (q) => q.eq("origin", "legacy_site"),
  );
  console.log(`Total carregado: ${articles.length}`);

  const sources = await fetchAll(
    "article_external_sources",
    "article_id, external_id, source_url, source_slug, original_category",
    (q) => q.eq("provider", "informativo_regional_legacy"),
  );
  const sourceByArticleId = new Map(sources.map((s) => [s.article_id, s]));

  const enriched = articles.map((a) => {
    const source = sourceByArticleId.get(a.id);
    const normTitle = normalizeTitle(a.title);
    const normBody = normalizeBody(a.body);
    const year = a.published_at ? Number(a.published_at.slice(0, 4)) : null;
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      status: a.status,
      publishedAt: a.published_at,
      publishedDate: a.published_at ? a.published_at.slice(0, 10) : null,
      batch: batchOf(year),
      sectionSlug: a.editorial_sections?.slug ?? null,
      externalId: source?.external_id ?? null,
      sourceUrl: source?.source_url ?? null,
      normTitle,
      bodyHash: normBody.length > 0 ? sha1(normBody) : null,
      bodyLength: normBody.length,
    };
  });

  const byTitleDate = new Map();
  for (const a of enriched) {
    if (!a.normTitle || !a.publishedDate) continue;
    const key = `${a.normTitle}::${a.publishedDate}`;
    if (!byTitleDate.has(key)) byTitleDate.set(key, []);
    byTitleDate.get(key).push(a);
  }
  const titleDateGroups = [...byTitleDate.values()].filter((g) => g.length > 1);

  function classify(group) {
    const externalIds = new Set(group.map((a) => a.externalId).filter(Boolean));
    const sourceUrls = new Set(group.map((a) => a.sourceUrl).filter(Boolean));
    const bodyHashes = new Set(group.map((a) => a.bodyHash).filter(Boolean));

    if (externalIds.size === 1 && group.length > 1) return "IMPOSSIVEL_MESMO_EXTERNAL_ID";
    if (sourceUrls.size === 1 && externalIds.size === 0 && group.length > 1) return "IMPOSSIVEL_MESMA_URL";
    if (bodyHashes.size === 1) return "DUPLICATA_REAL_PROVAVEL";

    const lengths = group.map((a) => a.bodyLength).filter((n) => n > 0);
    if (lengths.length === group.length) {
      const maxLen = Math.max(...lengths);
      const minLen = Math.min(...lengths);
      if (maxLen > 0 && (maxLen - minLen) / maxLen <= 0.05) {
        return "PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL";
      }
    }
    return "TITULO_DATA_IGUAIS_CONTEUDO_DIFERENTE";
  }

  const isDuplicateVerdict = (v) => v === "DUPLICATA_REAL_PROVAVEL" || v === "IMPOSSIVEL_MESMO_EXTERNAL_ID" || v === "IMPOSSIVEL_MESMA_URL";

  const classifiedGroups = titleDateGroups
    .map((g) => ({ verdict: classify(g), articles: g }))
    .filter((g) => isDuplicateVerdict(g.verdict) || g.verdict === "PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL");

  const alreadyResolved = [];
  const newCandidatesInvolving2025_2026 = [];
  const otherUnresolvedCandidates = [];

  for (const g of classifiedGroups) {
    const publishedCount = g.articles.filter((a) => a.status === "published").length;
    const involves2025 = g.articles.some((a) => a.batch === "2025-2026");
    if (publishedCount <= 1) {
      alreadyResolved.push(g);
    } else if (involves2025) {
      newCandidatesInvolving2025_2026.push(g);
    } else {
      otherUnresolvedCandidates.push(g);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalArticlesAudited: enriched.length,
    titleDateGroupsTotal: titleDateGroups.length,
    duplicateOrInspectionGroups: classifiedGroups.length,
    alreadyResolved: alreadyResolved.length,
    newCandidatesInvolving2025_2026: newCandidatesInvolving2025_2026.length,
    otherUnresolvedCandidates: otherUnresolvedCandidates.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (newCandidatesInvolving2025_2026.length > 0) {
    console.log("\n== NOVOS CANDIDATOS ENVOLVENDO 2025-2026 (>=2 published no grupo) ==");
    for (const g of newCandidatesInvolving2025_2026) {
      console.log(`- [${g.verdict}] "${g.articles[0].title}" (${g.articles[0].publishedDate}) — ${g.articles.map((a) => `${a.slug} (${a.batch}, ${a.status})`).join(" | ")}`);
    }
  }
  if (otherUnresolvedCandidates.length > 0) {
    console.log("\n== Candidatos não resolvidos fora de 2025-2026 (esperado: os 13 candidatos antigos pendentes) ==");
    for (const g of otherUnresolvedCandidates) {
      console.log(`- [${g.verdict}] "${g.articles[0].title}" (${g.articles[0].publishedDate}) — ${g.articles.map((a) => `${a.slug} (${a.batch}, ${a.status})`).join(" | ")}`);
    }
  }

  await writeFile(
    new URL("./output/duplicate-audit-2025-2026.json", import.meta.url),
    JSON.stringify({ summary, newCandidatesInvolving2025_2026, otherUnresolvedCandidates, alreadyResolved }, null, 2),
    "utf8",
  );
}

main().catch((e) => {
  console.error("Falha na auditoria de duplicatas:", e);
  process.exit(1);
});
