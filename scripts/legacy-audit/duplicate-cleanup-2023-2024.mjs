#!/usr/bin/env node
// Fase 45C — limpeza reversível do único grupo de duplicata confirmada
// da auditoria pós-carga de 2023-2024 (docs/legacy-duplicate-audit-2023-2024.md):
// "CASOS DE DENGUE AUMENTAM 900% EM SC" (external_id 572497 / 572509),
// corpo idêntico após normalização. Reaproveita EXATAMENTE a mesma regra
// determinística de canônico das limpezas anteriores (Fase 43/44F): capa
// > sem capa; editoria específica > geral; published_at mais recente;
// maior external_id como desempate. NUNCA deleta — só arquiva
// (status='archived', archived_at=now()) a cópia não-canônica. Não toca
// no grupo 569333/569372 (precisa inspeção manual) nem nos 13 candidatos
// antigos pendentes.
//
// Uso:
//   node duplicate-cleanup-2023-2024.mjs                 (dry-run)
//   node --env-file="../../.env.local" duplicate-cleanup-2023-2024.mjs --commit
import { writeFile } from "node:fs/promises";
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

const CONFIRMED_EXTERNAL_IDS = ["572497", "572509"];
// O grupo que NÃO pode ser tocado (precisa inspeção manual) — checagem
// de segurança extra abaixo, além de simplesmente não incluí-lo aqui.
const FORBIDDEN_EXTERNAL_IDS = new Set(["569333", "569372"]);

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

  const { data: sources, error } = await sb
    .from("article_external_sources")
    .select("article_id, external_id")
    .eq("provider", "informativo_regional_legacy")
    .in("external_id", CONFIRMED_EXTERNAL_IDS);
  if (error) throw error;
  if (sources.length !== CONFIRMED_EXTERNAL_IDS.length) {
    throw new Error(`Esperado ${CONFIRMED_EXTERNAL_IDS.length} fontes, encontrado ${sources.length} — PARANDO.`);
  }

  const articleIds = sources.map((s) => s.article_id);
  const { data: articles, error: aErr } = await sb
    .from("articles")
    .select("id, slug, title, status, published_at, editorial_sections(slug)")
    .in("id", articleIds);
  if (aErr) throw aErr;

  const bySourceArticleId = new Map(sources.map((s) => [s.article_id, s.external_id]));
  const { data: covers, error: coverErr } = await sb
    .from("article_media")
    .select("article_id")
    .eq("role", "cover")
    .in("article_id", articleIds);
  if (coverErr) throw coverErr;
  const hasCoverSet = new Set(covers.map((c) => c.article_id));

  const enriched = articles.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    status: a.status,
    publishedAt: a.published_at,
    sectionSlug: a.editorial_sections?.slug ?? null,
    externalId: bySourceArticleId.get(a.id),
    hasCover: hasCoverSet.has(a.id),
  }));

  const nonPublished = enriched.filter((a) => a.status !== "published");
  if (nonPublished.length > 0) {
    throw new Error(`Grupo tem artigo(s) não-published antes da limpeza: ${JSON.stringify(nonPublished)} — PARANDO.`);
  }

  const { canonical, toArchive } = pickCanonical(enriched);
  const plan = [{
    title: enriched[0].title,
    keep: { id: canonical.id, externalId: canonical.externalId, slug: canonical.slug, publishedAt: canonical.publishedAt, sectionSlug: canonical.sectionSlug, hasCover: canonical.hasCover },
    archive: toArchive.map((a) => ({ id: a.id, externalId: a.externalId, slug: a.slug, publishedAt: a.publishedAt, sectionSlug: a.sectionSlug, hasCover: a.hasCover })),
  }];

  const totalGroups = 1;
  const totalArticles = enriched.length;
  const totalArchive = toArchive.length;

  console.log(`Grupos confirmados: ${totalGroups}`);
  console.log(`Artigos envolvidos: ${totalArticles}`);
  console.log(`Artigos a arquivar: ${totalArchive}`);
  console.log(`Artigos canônicos (mantidos published): ${totalGroups}`);

  if (totalGroups !== 1) throw new Error(`Esperado 1 grupo, encontrado ${totalGroups} — PARANDO.`);
  if (totalArticles !== 2) throw new Error(`Esperado 2 artigos, encontrado ${totalArticles} — PARANDO.`);
  if (totalArchive !== 1) throw new Error(`Esperado 1 artigo a arquivar, calculado ${totalArchive} — PARANDO.`);

  const archiveIds = plan.flatMap((p) => p.archive.map((a) => a.id));
  const involvesForbidden = enriched.some((a) => FORBIDDEN_EXTERNAL_IDS.has(a.externalId));
  if (involvesForbidden) throw new Error("VAZAMENTO: grupo proibido (569333/569372) entraria na limpeza — PARANDO.");

  await writeFile(new URL("./output/duplicate-cleanup-2023-2024-plan.json", import.meta.url), JSON.stringify({ totalGroups, totalArchive, totalArticles, plan }, null, 2), "utf8");
  console.log("\nPlano completo salvo em output/duplicate-cleanup-2023-2024-plan.json");
  console.log(JSON.stringify(plan, null, 2));

  if (!COMMIT) {
    console.log("\n[DRY-RUN] Nenhuma gravação feita. Rode com --commit para aplicar.");
    return;
  }

  console.log(`\n[COMMIT] Arquivando ${archiveIds.length} artigo(s) (status='archived', archived_at=now())...`);
  const nowIso = new Date().toISOString();
  const { error: updErr, count } = await sb.from("articles").update({ status: "archived", archived_at: nowIso }, { count: "exact" }).in("id", archiveIds);
  if (updErr) throw updErr;
  console.log(`[COMMIT] Concluído: ${count ?? archiveIds.length} artigo(s) arquivado(s).`);
}

main().catch((e) => {
  console.error("Falha na limpeza de duplicatas 2023-2024:", e);
  process.exit(1);
});
