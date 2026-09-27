#!/usr/bin/env node
// Limpeza das duplicatas CONFIRMADAS (Fase 43, autorizada em
// docs/CHATGPT_REVIEW.md) — só os 54 grupos classificados como
// "DUPLICATA_REAL_PROVAVEL"/"DUPLICATA_REAL_PROVAVEL_CAPAS_DIFERENTES"
// pela auditoria (docs/legacy-duplicate-audit-2015-2020.md). NUNCA
// deleta nem mescla: arquiva (status='archived', archived_at=now()) a
// cópia não-canônica, preservando article_external_sources, mídia e
// todo o rastro. Os 11 grupos "precisa inspeção manual" e os 3
// "legítimos" NUNCA são tocados.
//
// Uso:
//   node duplicate-cleanup.mjs                 (dry-run — nunca grava)
//   node duplicate-cleanup.mjs --commit         (grava de verdade)
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const COMMIT = Boolean(args.commit);

const AUDIT = JSON.parse(await readFile(new URL("./output/duplicate-audit-2015-2020.json", import.meta.url), "utf8"));
const CONFIRMED_VERDICTS = new Set(["DUPLICATA_REAL_PROVAVEL", "DUPLICATA_REAL_PROVAVEL_CAPAS_DIFERENTES"]);

/**
 * Regra determinística de escolha da cópia canônica (ordem fixa, nunca
 * decidida por sorte/ordem de iteração):
 *   1) tem capa > não tem capa;
 *   2) editoria específica > "geral";
 *   3) published_at mais recente;
 *   4) empate exato de published_at: maior external_id numérico.
 * Nunca altera título/corpo/data/editoria de quem fica canônico — só
 * decide QUAL artigo permanece `published`.
 */
function pickCanonical(group) {
  const scored = group.articles.map((a) => ({
    a,
    hasCover: Boolean(a.coverOriginUrl),
    isGeneric: a.sectionSlug === "geral",
    publishedAtMs: a.publishedAt ? new Date(a.publishedAt).getTime() : 0,
    externalIdNum: a.externalId ? Number(a.externalId) : -Infinity,
  }));

  scored.sort((x, y) => {
    if (x.hasCover !== y.hasCover) return x.hasCover ? -1 : 1;
    if (x.isGeneric !== y.isGeneric) return x.isGeneric ? 1 : -1; // específica primeiro
    if (x.publishedAtMs !== y.publishedAtMs) return y.publishedAtMs - x.publishedAtMs; // mais recente primeiro
    return y.externalIdNum - x.externalIdNum; // maior external_id primeiro
  });

  return { canonical: scored[0].a, toArchive: scored.slice(1).map((s) => s.a) };
}

function buildPlan() {
  const confirmedGroups = AUDIT.titleDateGroups.filter((g) => CONFIRMED_VERDICTS.has(g.verdict));
  const plan = confirmedGroups.map((g) => {
    const { canonical, toArchive } = pickCanonical(g);
    return {
      title: g.articles[0].title,
      verdict: g.verdict,
      keep: { id: canonical.id, externalId: canonical.externalId, slug: canonical.slug, publishedAt: canonical.publishedAt, sectionSlug: canonical.sectionSlug, hasCover: Boolean(canonical.coverOriginUrl) },
      archive: toArchive.map((a) => ({ id: a.id, externalId: a.externalId, slug: a.slug, publishedAt: a.publishedAt, sectionSlug: a.sectionSlug, hasCover: Boolean(a.coverOriginUrl) })),
    };
  });

  const totalGroups = plan.length;
  const totalKeep = plan.length;
  const totalArchive = plan.reduce((sum, p) => sum + p.archive.length, 0);
  const totalArticles = plan.reduce((sum, p) => sum + 1 + p.archive.length, 0);

  return { plan, totalGroups, totalKeep, totalArchive, totalArticles };
}

async function main() {
  const { plan, totalGroups, totalKeep, totalArchive, totalArticles } = buildPlan();

  console.log(`Grupos confirmados: ${totalGroups}`);
  console.log(`Artigos mantidos (canônicos): ${totalKeep}`);
  console.log(`Artigos a arquivar: ${totalArchive}`);
  console.log(`Total de artigos nos grupos confirmados: ${totalArticles}`);

  if (totalGroups !== 54) throw new Error(`Esperado 54 grupos confirmados, encontrado ${totalGroups} — PARANDO, não corresponde ao autorizado.`);
  if (totalArchive !== 61) throw new Error(`Esperado 61 artigos a arquivar, calculado ${totalArchive} — PARANDO, não corresponde ao autorizado.`);
  if (totalArticles !== 115) throw new Error(`Esperado 115 artigos nos grupos confirmados, calculado ${totalArticles} — PARANDO.`);

  // Confirma que nenhum ID dos grupos NÃO confirmados (inspeção manual / legítimos) está na lista de arquivamento.
  const nonConfirmedIds = new Set(
    AUDIT.titleDateGroups
      .filter((g) => !CONFIRMED_VERDICTS.has(g.verdict))
      .flatMap((g) => g.articles.map((a) => a.id)),
  );
  const archiveIds = plan.flatMap((p) => p.archive.map((a) => a.id));
  const leaked = archiveIds.filter((id) => nonConfirmedIds.has(id));
  if (leaked.length > 0) throw new Error(`VAZAMENTO: ${leaked.length} IDs de grupos não confirmados entrariam no arquivamento — PARANDO.`);

  await writeFile(new URL("./output/duplicate-cleanup-plan.json", import.meta.url), JSON.stringify({ totalGroups, totalKeep, totalArchive, totalArticles, plan }, null, 2), "utf8");
  console.log("Plano completo salvo em output/duplicate-cleanup-plan.json");

  // Caso específico do usuário.
  const targetGroup = plan.find((p) => p.title === "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO");
  if (targetGroup) {
    console.log("\nCaso do usuário (HOMEM REENCONTRA A FAMÍLIA...):");
    console.log("  Mantém (published):", JSON.stringify(targetGroup.keep));
    console.log("  Arquiva:", JSON.stringify(targetGroup.archive));
  }

  if (!COMMIT) {
    console.log("\n[DRY-RUN] Nenhuma gravação feita. Rode com --commit para aplicar.");
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente (--env-file).");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n[COMMIT] Arquivando ${archiveIds.length} artigos (status='archived', archived_at=now())...`);
  let archived = 0;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < archiveIds.length; i += 50) {
    const chunk = archiveIds.slice(i, i + 50);
    const { error, count } = await sb.from("articles").update({ status: "archived", archived_at: nowIso }, { count: "exact" }).in("id", chunk);
    if (error) throw error;
    archived += count ?? chunk.length;
    console.log(`  ${Math.min(i + 50, archiveIds.length)}/${archiveIds.length} processados`);
  }
  console.log(`\n[COMMIT] Concluído: ${archived} artigos arquivados.`);
}

main().catch((e) => {
  console.error("Falha na limpeza de duplicatas:", e);
  process.exit(1);
});
