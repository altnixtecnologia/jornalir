#!/usr/bin/env node
// Relatório humano do sync incremental (Lote 1, 18/10/2026) — SOMENTE
// LEITURA. Reaproveita 100% a mesma descoberta/crawl/dedup/classificação de
// sync-recent.mjs (nenhuma lógica de parsing/identidade/importação
// duplicada ou reescrita aqui) e só serializa o detalhe por matéria que o
// preflight original não grava em arquivo: título, data/hora, editoria,
// URL de origem, situação no banco novo, imagens identificadas e
// inconsistências. Nunca grava no Supabase nem no R2, nunca importa.
// Uso: node --env-file=.env.local scripts/legacy-audit/report-sync-recent.mjs
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText, createRateLimiter } from "./lib/http.mjs";
import { parseArticlePage } from "./lib/parse.mjs";
import { CATEGORY_TO_SECTION_SLUG } from "./lib/batches.mjs";
import { dedupeByIdentity, filterByBatchRange, candidateKey, collectImageRefs, classifyCandidates } from "./lib/pipeline.mjs";
import { supabaseAdmin, findExistingArticleId } from "./lib/importer.mjs";
import { loadManualArticles, partitionEligibleAgainstManual } from "./lib/manual-guard.mjs";
import { findCutoff, crawlCategoryRecent } from "./sync-recent.mjs";

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const OUTPUT_DIR = path.join(AUDIT_DIR, "output");
const REPORT_MD = path.join(ROOT_DIR, "docs", "LEGADO-DRY-RUN-sync-recent-20261018.md");

const CATEGORIES = Object.keys(CATEGORY_TO_SECTION_SLUG).filter((c) => c !== "classificados");
const RPS = 4;

// Timestamp completo (com hora real, ex. article_external_sources.original_published_at)
// — aqui sim faz sentido converter para o fuso de exibição.
function fmtFullTimestamp(iso) {
  if (!iso) return "(sem data)";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
// publishedIso é só "YYYY-MM-DD" (sem hora) — NUNCA converter por timezone
// aqui: vira meia-noite UTC e "volta" um dia em America/Sao_Paulo (bug já
// visto na primeira versão deste relatório). A hora real de cada matéria já
// aparece em publishedRawListing.
function fmtDateOnly(iso) {
  if (!iso) return "(sem data)";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function row(status, c, detail, extra = {}) {
  const refs = detail ? collectImageRefs(detail) : [];
  return {
    status,
    title: detail?.title || c.primary.title,
    publishedAt: detail?.publishedRaw ? c.publishedIso : (c.publishedIso ?? null),
    publishedRawListing: c.primary.listingDateRaw,
    legacyCategory: c.primary.category,
    section: CATEGORY_TO_SECTION_SLUG[c.primary.category] ?? "(?)",
    sourceUrl: c.primary.url,
    images: refs.length,
    coverUrl: detail?.coverUrl ?? null,
    ...extra,
  };
}

async function main() {
  const sb = supabaseAdmin();
  console.log("== report-sync-recent (Lote 1, dry-run) — SOMENTE LEITURA ==");

  const { lastExisting, cutoffDateIso } = await findCutoff(sb);
  const throttle = createRateLimiter(RPS);

  const allItems = [];
  for (const category of CATEGORIES) {
    const items = await crawlCategoryRecent(category, cutoffDateIso, throttle, console.log);
    console.log(`  ${category}: ${items.length} item(ns)`);
    allItems.push(...items);
  }

  const candidates = dedupeByIdentity(allItems);
  const { eligible: inRange, dateExceptions } = filterByBatchRange(candidates, { start: cutoffDateIso, end: "2100-12-31" });

  const existingRows = [];
  const newCandidates = [];
  for (const c of inRange) {
    const existingId = await findExistingArticleId(sb, c.identity);
    if (existingId) existingRows.push({ c, existingArticleId: existingId });
    else newCandidates.push(c);
  }

  const detailCache = new Map();
  const detailFetchFailed = [];
  for (const c of inRange) {
    await throttle();
    const { ok, text, status } = await fetchText(c.primary.url);
    if (!ok) { detailFetchFailed.push({ url: c.primary.url, status }); continue; }
    detailCache.set(candidateKey(c), parseArticlePage(text, c.primary.url));
  }

  const { eligibleList: classifiedEligibleList, needsReviewList, quarantinedList, rejectedList } = classifyCandidates(newCandidates, detailCache);

  // Mesma proteção mínima usada pelo sync-recent.mjs real (lib/manual-guard.mjs)
  // — o relatório precisa refletir exatamente o que o --commit faria.
  const manualArticles = await loadManualArticles(sb);
  const { finalEligible: eligibleList, manualDuplicateList, manualAmbiguousList } =
    partitionEligibleAgainstManual(classifiedEligibleList, manualArticles, detailCache, candidateKey);

  const rows = [];
  for (const { c, existingArticleId } of existingRows) {
    rows.push(row("já existe (mídia a reconciliar)", c, detailCache.get(candidateKey(c)), { existingArticleId }));
  }
  for (const { candidate: c, detail } of eligibleList) rows.push(row("elegível para importar", c, detail));
  for (const { candidate: c, detail, manualMatch } of manualDuplicateList) rows.push(row("duplicata de matéria manual (fora da importação)", c, detail, { manualMatch }));
  for (const { candidate: c, detail, manualMatch } of manualAmbiguousList) rows.push(row("ambíguo vs. matéria manual — revisão humana (fora da importação)", c, detail, { manualMatch }));
  for (const { candidate: c, detail, reasons } of needsReviewList) rows.push(row("precisa revisão manual", c, detail, { reasons }));
  for (const { candidate: c, detail, reasons } of quarantinedList) rows.push(row("quarentena editorial", c, detail, { reasons }));
  for (const { candidate: c, detail, reasons } of rejectedList) rows.push(row("rejeitada", c, detail, { reasons }));
  for (const { url, status } of detailFetchFailed) rows.push({ status: "falha ao buscar detalhe", sourceUrl: url, httpStatus: status });

  rows.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));

  const dates = rows.map((r) => r.publishedAt).filter(Boolean).sort();
  const startDate = dates[0] ?? null;
  const endDate = dates[dates.length - 1] ?? null;

  const summary = {
    generatedAt: new Date().toISOString(),
    lastExistingInDb: lastExisting,
    cutoffDateIso,
    rangeComparedStart: startDate,
    rangeComparedEnd: endDate,
    foundOnSite: allItems.length,
    uniqueCandidatesInRange: inRange.length,
    dateExceptions: dateExceptions.length,
    alreadyExisting: existingRows.length,
    newEligible: eligibleList.length,
    manualDuplicateConfirmed: manualDuplicateList.length,
    manualAmbiguous: manualAmbiguousList.length,
    needsReview: needsReviewList.length,
    quarantined: quarantinedList.length,
    rejected: rejectedList.length,
    detailFetchFailed: detailFetchFailed.length,
  };

  console.log("\n== RESUMO ==");
  console.log(JSON.stringify(summary, null, 2));

  const md = `# Lote 1 — Dry-run de sincronização do site legado (18/10/2026)

Gerado em: ${new Date().toISOString()} · SOMENTE LEITURA — nenhuma matéria/imagem foi gravada, nenhum \`--commit\` executado.

## Resumo

| Métrica | Valor |
|---|---|
| Última matéria já existente no banco (corte do sync) | "${summary.lastExistingInDb.title}" — ${fmtFullTimestamp(summary.lastExistingInDb.originalPublishedAt)} |
| Data de corte usada na varredura | ${fmtDateOnly(summary.cutoffDateIso)} |
| Período efetivamente comparado | ${fmtDateOnly(summary.rangeComparedStart)} a ${fmtDateOnly(summary.rangeComparedEnd)} |
| Itens encontrados no site (antes de deduplicar) | ${summary.foundOnSite} |
| Candidatas únicas no intervalo | ${summary.uniqueCandidatesInRange} |
| Já existem no banco novo (só mídia a reconciliar) | ${summary.alreadyExisting} |
| **Novas elegíveis para importar** | **${summary.newEligible}** |
| Duplicata confirmada de matéria manual (fora da importação) | ${summary.manualDuplicateConfirmed} |
| Ambígua vs. matéria manual — revisão humana (fora da importação) | ${summary.manualAmbiguous} |
| Precisam de revisão manual | ${summary.needsReview} |
| Em quarentena editorial | ${summary.quarantined} |
| Rejeitadas (falha de busca) | ${summary.rejected} |
| Exceções de data | ${summary.dateExceptions} |
| Falha ao buscar detalhe (sem conclusão) | ${summary.detailFetchFailed} |

## Matérias (ordem cronológica)

${rows.map((r, i) => `### ${i + 1}. ${r.title ?? "(sem título)"}

- **Status:** ${r.status}
- **Data original (listagem, com hora real):** \`${r.publishedRawListing ?? "?"}\` — data normalizada: ${fmtDateOnly(r.publishedAt)}
- **Editoria legada / destino:** ${r.legacyCategory ?? "?"} → ${r.section ?? "?"}
- **URL de origem:** ${r.sourceUrl}
- **Situação no banco novo:** ${r.existingArticleId ? `já existe (articles.id=${r.existingArticleId})` : r.status === "elegível para importar" ? "não encontrada — candidata a nova matéria" : r.status}
- **Imagens identificadas:** ${r.images ?? 0}${r.coverUrl ? ` (capa: ${r.coverUrl})` : ""}
- **Inconsistências:** ${r.reasons?.length ? r.reasons.join("; ") : (r.httpStatus ? `HTTP ${r.httpStatus} ao buscar a página de detalhe` : "nenhuma")}
`).join("\n---\n\n")}
`;

  await writeFile(REPORT_MD, md, "utf8");
  const jsonPath = path.join(OUTPUT_DIR, `report-sync-recent-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(jsonPath, JSON.stringify({ summary, rows }, null, 2), "utf8");
  console.log(`\nRelatório humano: ${REPORT_MD}`);
  console.log(`Dados completos: ${jsonPath}`);
}

main().catch((error) => {
  console.error("Falha no report-sync-recent:", error);
  process.exitCode = 1;
});
