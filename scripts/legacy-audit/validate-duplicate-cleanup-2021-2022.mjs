#!/usr/bin/env node
// Fase 44F — validação pós-limpeza. Só SELECT, nenhuma escrita.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const plan = JSON.parse(await readFile(new URL("./output/duplicate-cleanup-2021-2022-plan.json", import.meta.url), "utf8"));

let groupsOk = 0;
let groupsBad = [];
for (const g of plan.plan) {
  const ids = [g.keep.id, ...g.archive.map((a) => a.id)];
  const { data, error } = await sb.from("articles").select("id, status, archived_at, title, body, section_id").in("id", ids);
  if (error) throw error;
  const publishedCount = data.filter((a) => a.status === "published").length;
  const archivedCount = data.filter((a) => a.status === "archived").length;
  const keepRow = data.find((a) => a.id === g.keep.id);
  const ok = publishedCount === 1 && archivedCount === g.archive.length && keepRow?.status === "published";
  if (ok) groupsOk += 1;
  else groupsBad.push({ title: g.title, publishedCount, archivedCount, expectedArchived: g.archive.length });
}
console.log(`Grupos com exatamente 1 published + resto archived: ${groupsOk}/${plan.plan.length}`);
if (groupsBad.length) console.log("PROBLEMAS:", JSON.stringify(groupsBad, null, 2));

// archived_at preenchido para os 13
const archiveIds = plan.plan.flatMap((g) => g.archive.map((a) => a.id));
const { data: archivedRows, error: e2 } = await sb.from("articles").select("id, status, archived_at").in("id", archiveIds);
if (e2) throw e2;
const missingArchivedAt = archivedRows.filter((r) => r.status !== "archived" || !r.archived_at);
console.log(`13 artigos arquivados com archived_at preenchido: ${archivedRows.length - missingArchivedAt.length}/${archivedRows.length}`);

// totais físicos inalterados
const { count: totalArticles, error: e3 } = await sb.from("articles").select("id", { count: "exact", head: true });
if (e3) throw e3;
console.log(`Total físico de articles (deve continuar 13.688 — nada deletado): ${totalArticles}`);

const { count: publishedTotal, error: e4 } = await sb.from("articles").select("id", { count: "exact", head: true }).eq("status", "published").eq("origin", "legacy_site");
if (e4) throw e4;
console.log(`Total published (origin=legacy_site) agora (13.688 - já arquivados antes - 13 novos): ${publishedTotal}`);

const { count: totalSources, error: e5 } = await sb.from("article_external_sources").select("id", { count: "exact", head: true });
if (e5) throw e5;
console.log(`Total article_external_sources (deve continuar 13.688 — nenhuma linha removida): ${totalSources}`);

const { count: totalMedia, error: e6 } = await sb.from("article_media").select("id", { count: "exact", head: true });
if (e6) throw e6;
console.log(`Total article_media (deve continuar 21.089 — nenhuma mídia tocada): ${totalMedia}`);

// Confirma que os 3 grupos PRECISA_INSPECAO de 2021-2022 continuam ambos published
const auditFile = JSON.parse(await readFile(new URL("./output/duplicate-audit-2021-2022.json", import.meta.url), "utf8"));
const inspecaoGroups = auditFile.newCandidatesInvolving2021_2022.filter((g) => g.verdict !== "DUPLICATA_REAL_PROVAVEL");
let inspecaoIntact = true;
for (const g of inspecaoGroups) {
  const ids = g.articles.map((a) => a.id);
  const { data, error } = await sb.from("articles").select("id, status").in("id", ids);
  if (error) throw error;
  const allPublished = data.every((a) => a.status === "published");
  if (!allPublished) { inspecaoIntact = false; console.log("PROBLEMA (grupo inspeção tocado):", g.articles[0].title, JSON.stringify(data)); }
}
console.log(`Grupos PRECISA_INSPECAO de 2021-2022 (3) continuam 100% published (intocados): ${inspecaoIntact}`);
