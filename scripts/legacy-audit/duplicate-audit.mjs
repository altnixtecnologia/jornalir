#!/usr/bin/env node
// Auditoria SOMENTE LEITURA de possíveis matérias duplicadas entre os 3
// lotes já migrados (2015-2020, 9.213 articles) — pedido do usuário após
// observar visualmente uma duplicata no portal. NUNCA apaga, mescla ou
// altera nada; só classifica. Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// no ambiente (nunca imprime a chave).
//
// Regra editorial confirmada pelo usuário (Fase 43B) para QUALQUER reuso
// futuro deste script: mesmo título em datas diferentes NUNCA é
// duplicata por si só; mesmo título + mesma data é só um candidato, nunca
// motivo suficiente sozinho para arquivar automaticamente. A classificação
// abaixo já respeita isso — só os grupos com corpo normalizado idêntico
// (ou de tamanho quase idêntico, marcados para revisão manual) viram
// candidatos reais; título+data sozinhos nunca decidem nada.
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

async function main() {
  console.log("Carregando os 9.213 articles migrados (paginado)...");
  const articles = await fetchAll(
    "articles",
    "id, slug, title, subtitle, body, section_id, locality_id, published_at, editorial_sections(slug,name)",
    (q) => q.eq("origin", "legacy_site"),
  );
  console.log(`Total carregado: ${articles.length}`);

  const sources = await fetchAll(
    "article_external_sources",
    "article_id, external_id, source_url, source_slug, original_category",
    (q) => q.eq("provider", "informativo_regional_legacy"),
  );
  const sourceByArticleId = new Map(sources.map((s) => [s.article_id, s]));

  const articleIds = articles.map((a) => a.id);
  const covers = [];
  for (let i = 0; i < articleIds.length; i += 200) {
    const chunk = articleIds.slice(i, i + 200);
    const rows = await fetchAll("article_media", "article_id, role, media_assets(origin_source_url, public_url)", (q) =>
      q.in("article_id", chunk).eq("role", "cover"),
    );
    covers.push(...rows);
  }
  const coverByArticleId = new Map(covers.map((c) => [c.article_id, c.media_assets]));

  // Enriquece cada artigo com dados derivados.
  const enriched = articles.map((a) => {
    const source = sourceByArticleId.get(a.id);
    const cover = coverByArticleId.get(a.id);
    const normTitle = normalizeTitle(a.title);
    const normBody = normalizeBody(a.body);
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      publishedAt: a.published_at,
      publishedDate: a.published_at ? a.published_at.slice(0, 10) : null,
      sectionSlug: a.editorial_sections?.slug ?? null,
      sectionName: a.editorial_sections?.name ?? null,
      externalId: source?.external_id ?? null,
      sourceUrl: source?.source_url ?? null,
      sourceSlug: source?.source_slug ?? null,
      originalCategory: source?.original_category ?? null,
      coverOriginUrl: cover?.origin_source_url ?? null,
      coverPublicUrl: cover?.public_url ?? null,
      normTitle,
      bodyHash: normBody.length > 0 ? sha1(normBody) : null,
      bodyLength: normBody.length,
    };
  });

  // --- Grupo 1: mesmo título normalizado + mesma data de publicação. ---
  const byTitleDate = new Map();
  for (const a of enriched) {
    if (!a.normTitle || !a.publishedDate) continue;
    const key = `${a.normTitle}::${a.publishedDate}`;
    if (!byTitleDate.has(key)) byTitleDate.set(key, []);
    byTitleDate.get(key).push(a);
  }
  const titleDateGroups = [...byTitleDate.values()].filter((g) => g.length > 1);

  // --- Grupo 2: mesmo corpo normalizado (hash exato). ---
  const byBodyHash = new Map();
  for (const a of enriched) {
    if (!a.bodyHash || a.bodyLength < 40) continue; // corpo muito curto gera falso-positivo (ex.: "COVID-19" sozinho)
    if (!byBodyHash.has(a.bodyHash)) byBodyHash.set(a.bodyHash, []);
    byBodyHash.get(a.bodyHash).push(a);
  }
  const bodyHashGroups = [...byBodyHash.values()].filter((g) => g.length > 1);

  // --- Grupo 3: mesma URL de origem da capa (mesma imagem usada em mais de 1 artigo, mas artigos diferentes). ---
  const byCoverUrl = new Map();
  for (const a of enriched) {
    if (!a.coverOriginUrl) continue;
    if (!byCoverUrl.has(a.coverOriginUrl)) byCoverUrl.set(a.coverOriginUrl, []);
    byCoverUrl.get(a.coverOriginUrl).push(a);
  }
  const coverUrlGroups = [...byCoverUrl.values()].filter((g) => g.length > 1);

  // --- Checagem estrutural: mesmo external_id ou mesma source_url em artigos DIFERENTES (bug grave, não deveria existir — índice único deveria impedir). ---
  const byExternalId = new Map();
  const bySourceUrl = new Map();
  for (const a of enriched) {
    if (a.externalId) {
      if (!byExternalId.has(a.externalId)) byExternalId.set(a.externalId, []);
      byExternalId.get(a.externalId).push(a);
    }
    if (a.sourceUrl) {
      if (!bySourceUrl.has(a.sourceUrl)) bySourceUrl.set(a.sourceUrl, []);
      bySourceUrl.get(a.sourceUrl).push(a);
    }
  }
  const impossibleExternalIdDupes = [...byExternalId.values()].filter((g) => g.length > 1);
  const impossibleSourceUrlDupes = [...bySourceUrl.values()].filter((g) => g.length > 1);

  // --- Classificação de cada grupo título+data: duplicata real provável vs. legítimo. ---
  // Achado real ao revisar os primeiros resultados: hash exato sozinho
  // SUBESTIMA duplicatas — vários grupos com corpos de tamanho quase
  // idêntico (diferença de poucos caracteres, ex.: 1180 vs 1175) tinham
  // hash diferente só por um espaço/typo corrigido na republicação, e
  // seriam classificados como "conteúdo diferente" por engano. Corrigido
  // com uma faixa de tolerância de tamanho (nunca decide sozinho — só
  // rebaixa para "precisa inspeção manual", nunca promove a "duplicata
  // certa" sem hash igual).
  function classify(group) {
    const externalIds = new Set(group.map((a) => a.externalId).filter(Boolean));
    const sourceUrls = new Set(group.map((a) => a.sourceUrl).filter(Boolean));
    const bodyHashes = new Set(group.map((a) => a.bodyHash).filter(Boolean));
    const coverUrls = new Set(group.map((a) => a.coverOriginUrl).filter(Boolean));

    if (externalIds.size === 1 && group.length > 1) return "IMPOSSIVEL_MESMO_EXTERNAL_ID";
    if (sourceUrls.size === 1 && externalIds.size === 0 && group.length > 1) return "IMPOSSIVEL_MESMA_URL";
    if (bodyHashes.size === 1 && coverUrls.size <= 1) return "DUPLICATA_REAL_PROVAVEL";
    if (bodyHashes.size === 1) return "DUPLICATA_REAL_PROVAVEL_CAPAS_DIFERENTES";

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

  const classifiedTitleDateGroups = titleDateGroups.map((g) => ({ verdict: classify(g), articles: g }));
  const counts = {};
  for (const g of classifiedTitleDateGroups) counts[g.verdict] = (counts[g.verdict] ?? 0) + 1;

  // --- Caso específico citado pelo usuário. ---
  const targetNormTitle = normalizeTitle("HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO");
  const targetMatches = enriched.filter((a) => a.normTitle === targetNormTitle);

  const summary = {
    generatedAt: new Date().toISOString(),
    totalArticlesAudited: enriched.length,
    titleDateGroups: {
      totalGroups: titleDateGroups.length,
      totalArticlesInvolved: titleDateGroups.reduce((sum, g) => sum + g.length, 0),
      byVerdict: counts,
    },
    bodyHashGroups: {
      totalGroups: bodyHashGroups.length,
      totalArticlesInvolved: bodyHashGroups.reduce((sum, g) => sum + g.length, 0),
    },
    coverUrlGroups: {
      totalGroups: coverUrlGroups.length,
      totalArticlesInvolved: coverUrlGroups.reduce((sum, g) => sum + g.length, 0),
    },
    impossibleDuplicates: {
      sameExternalId: impossibleExternalIdDupes.length,
      sameSourceUrl: impossibleSourceUrlDupes.length,
    },
    targetCase: {
      title: "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO",
      matchesFound: targetMatches.length,
      matches: targetMatches,
    },
  };

  await writeFile(
    new URL("./output/duplicate-audit-2015-2020.json", import.meta.url),
    JSON.stringify(
      {
        summary,
        titleDateGroups: classifiedTitleDateGroups,
        bodyHashGroups,
        coverUrlGroups,
        impossibleExternalIdDupes,
        impossibleSourceUrlDupes,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("Falha na auditoria de duplicatas:", e);
  process.exit(1);
});
