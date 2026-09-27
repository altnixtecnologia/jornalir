#!/usr/bin/env node
// Fase 44F — limpeza reversível dos 10 grupos de duplicatas confirmadas
// pela auditoria pós-carga de 2021-2022 (docs/legacy-duplicate-audit-2021-2022.md):
//   - 8 grupos novos de 2021-2022 com corpo idêntico (verdict
//     DUPLICATA_REAL_PROVAVEL em output/duplicate-audit-2021-2022.json);
//   - 2 pares antigos de 2019-2020 (417983/417982 e 417727/417726) cujo
//     corpo ficou byte-a-byte idêntico como efeito colateral da
//     sanitização da Fase 44D.
// Reaproveita EXATAMENTE a mesma regra determinística de canônico da
// Fase 43 (duplicate-cleanup.mjs): capa > sem capa; editoria específica
// > geral; published_at mais recente; maior external_id como desempate.
// NUNCA deleta, NUNCA mescla — só arquiva (status='archived',
// archived_at=now()) as cópias não-canônicas. Não toca nos 3 grupos
// PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL de 2021-2022 nem nos 9 grupos
// antigos ainda pendentes.
//
// Uso:
//   node duplicate-cleanup-2021-2022.mjs                 (dry-run)
//   node --env-file="../../.env.local" duplicate-cleanup-2021-2022.mjs --commit
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const COMMIT = Boolean(args.commit);

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente (--env-file).");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Os 2 pares antigos de 2019-2020, confirmados na auditoria (Fase 44E),
// identificados só por external_id — buscados frescos do banco abaixo.
const OLD_PAIR_EXTERNAL_IDS = [
  ["417983", "417982"],
  ["417727", "417726"],
];

function pickCanonical(articles) {
  const scored = articles.map((a) => ({
    a,
    hasCover: Boolean(a.hasCover),
    isGeneric: a.sectionSlug === "geral",
    publishedAtMs: a.publishedAt ? new Date(a.publishedAt).getTime() : 0,
    externalIdNum: a.externalId ? Number(a.externalId) : -Infinity,
  }));
  scored.sort((x, y) => {
    if (x.hasCover !== y.hasCover) return x.hasCover ? -1 : 1;
    if (x.isGeneric !== y.isGeneric) return x.isGeneric ? 1 : -1;
    if (x.publishedAtMs !== y.publishedAtMs) return y.publishedAtMs - x.publishedAtMs;
    return y.externalIdNum - x.externalIdNum;
  });
  return { canonical: scored[0].a, toArchive: scored.slice(1).map((s) => s.a) };
}

async function main() {
  const sb = supabaseAdmin();

  // 1) Os 8 grupos novos de 2021-2022 (do relatório já gerado).
  const auditFile = JSON.parse(await readFile(new URL("./output/duplicate-audit-2021-2022.json", import.meta.url), "utf8"));
  const groups2021 = auditFile.newCandidatesInvolving2021_2022.filter((g) => g.verdict === "DUPLICATA_REAL_PROVAVEL");

  // 2) Os 2 pares antigos de 2019-2020 — buscados frescos do banco por external_id.
  const oldGroups = [];
  for (const ids of OLD_PAIR_EXTERNAL_IDS) {
    const { data: sources, error } = await sb
      .from("article_external_sources")
      .select("article_id, external_id")
      .eq("provider", "informativo_regional_legacy")
      .in("external_id", ids);
    if (error) throw error;
    if (sources.length !== ids.length) throw new Error(`Par antigo ${ids.join("/")}: esperado ${ids.length} fontes, encontrado ${sources.length}.`);
    const articleIds = sources.map((s) => s.article_id);
    const { data: articles, error: aErr } = await sb
      .from("articles")
      .select("id, slug, title, status, published_at, editorial_sections(slug)")
      .in("id", articleIds);
    if (aErr) throw aErr;
    const bySourceArticleId = new Map(sources.map((s) => [s.article_id, s.external_id]));
    oldGroups.push({
      verdict: "DUPLICATA_REAL_PROVAVEL",
      articles: articles.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        status: a.status,
        publishedAt: a.published_at,
        sectionSlug: a.editorial_sections?.slug ?? null,
        externalId: bySourceArticleId.get(a.id),
      })),
    });
  }

  const allGroups = [...groups2021, ...oldGroups];

  // Enriquecer todos os artigos com hasCover fresco do banco (não estava
  // no JSON de auditoria de 2021-2022).
  const allArticleIds = allGroups.flatMap((g) => g.articles.map((a) => a.id));
  const { data: covers, error: coverErr } = await sb
    .from("article_media")
    .select("article_id")
    .eq("role", "cover")
    .in("article_id", allArticleIds);
  if (coverErr) throw coverErr;
  const hasCoverSet = new Set(covers.map((c) => c.article_id));

  for (const g of allGroups) {
    for (const a of g.articles) a.hasCover = hasCoverSet.has(a.id);
  }

  // Confirma que cada grupo, no estado ATUAL do banco, tem TODOS os
  // artigos ainda published (nenhum já foi arquivado por outro motivo).
  for (const g of allGroups) {
    const nonPublished = g.articles.filter((a) => a.status !== "published");
    if (nonPublished.length > 0) {
      throw new Error(`Grupo "${g.articles[0].title}" tem artigo(s) não-published antes da limpeza: ${JSON.stringify(nonPublished)} — PARANDO.`);
    }
  }

  const plan = allGroups.map((g) => {
    const { canonical, toArchive } = pickCanonical(g.articles);
    return {
      title: g.articles[0].title,
      keep: { id: canonical.id, externalId: canonical.externalId, slug: canonical.slug, publishedAt: canonical.publishedAt, sectionSlug: canonical.sectionSlug, hasCover: canonical.hasCover },
      archive: toArchive.map((a) => ({ id: a.id, externalId: a.externalId, slug: a.slug, publishedAt: a.publishedAt, sectionSlug: a.sectionSlug, hasCover: a.hasCover })),
    };
  });

  const totalGroups = plan.length;
  const totalArchive = plan.reduce((sum, p) => sum + p.archive.length, 0);
  const totalArticles = plan.reduce((sum, p) => sum + 1 + p.archive.length, 0);

  console.log(`Grupos confirmados: ${totalGroups}`);
  console.log(`Artigos envolvidos: ${totalArticles}`);
  console.log(`Artigos a arquivar: ${totalArchive}`);
  console.log(`Artigos canônicos (mantidos published): ${totalGroups}`);

  if (totalGroups !== 10) throw new Error(`Esperado 10 grupos, encontrado ${totalGroups} — PARANDO.`);
  if (totalArticles !== 23) throw new Error(`Esperado 23 artigos envolvidos, calculado ${totalArticles} — PARANDO.`);
  if (totalArchive !== 13) throw new Error(`Esperado 13 artigos a arquivar, calculado ${totalArchive} — PARANDO.`);

  // Confirma que nenhum ID dos 3 grupos PRECISA_INSPECAO de 2021-2022
  // nem dos 9 grupos antigos ainda pendentes entrou no plano.
  const inspecaoIds = new Set(
    auditFile.newCandidatesInvolving2021_2022
      .filter((g) => g.verdict !== "DUPLICATA_REAL_PROVAVEL")
      .flatMap((g) => g.articles.map((a) => a.id)),
  );
  const pendingOldIds = new Set(
    auditFile.otherUnresolvedCandidates
      .filter((g) => !(g.articles.some((a) => a.externalId === "417983") || g.articles.some((a) => a.externalId === "417727")))
      .flatMap((g) => g.articles.map((a) => a.id)),
  );
  const archiveIds = plan.flatMap((p) => p.archive.map((a) => a.id));
  const leakedInspecao = archiveIds.filter((id) => inspecaoIds.has(id));
  const leakedPending = archiveIds.filter((id) => pendingOldIds.has(id));
  if (leakedInspecao.length > 0) throw new Error(`VAZAMENTO: ${leakedInspecao.length} IDs de grupos PRECISA_INSPECAO entrariam no arquivamento — PARANDO.`);
  if (leakedPending.length > 0) throw new Error(`VAZAMENTO: ${leakedPending.length} IDs de grupos antigos pendentes entrariam no arquivamento — PARANDO.`);

  await writeFile(new URL("./output/duplicate-cleanup-2021-2022-plan.json", import.meta.url), JSON.stringify({ totalGroups, totalArchive, totalArticles, plan }, null, 2), "utf8");
  console.log("\nPlano completo salvo em output/duplicate-cleanup-2021-2022-plan.json");
  console.log(JSON.stringify(plan, null, 2));

  if (!COMMIT) {
    console.log("\n[DRY-RUN] Nenhuma gravação feita. Rode com --commit para aplicar.");
    return;
  }

  console.log(`\n[COMMIT] Arquivando ${archiveIds.length} artigos (status='archived', archived_at=now())...`);
  const nowIso = new Date().toISOString();
  const { error: updErr, count } = await sb.from("articles").update({ status: "archived", archived_at: nowIso }, { count: "exact" }).in("id", archiveIds);
  if (updErr) throw updErr;
  console.log(`[COMMIT] Concluído: ${count ?? archiveIds.length} artigos arquivados.`);
}

main().catch((e) => {
  console.error("Falha na limpeza de duplicatas 2021-2022:", e);
  process.exit(1);
});
