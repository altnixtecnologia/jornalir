#!/usr/bin/env node
// Gera os dois relatórios humanos do lote 2015-2016 pedidos na Fase 35B
// (item 8/9) — nunca decide o destino de nada, só descreve para revisão:
//   docs/legacy-review-2015-2016.md   (os needs_review, caso a caso)
//   docs/legacy-sample-check-2015-2016.md (amostra determinística dos eligible)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBatch, CATEGORY_TO_SECTION_SLUG } from "./lib/batches.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, classifyCandidates, collectImageRefs, loadDetailCache } from "./lib/pipeline.mjs";
import { normalizeUrl } from "./lib/identity.mjs";

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const BATCH_KEY = "2015-2016";
const batch = getBatch(BATCH_KEY);
const batchDir = path.join(AUDIT_DIR, "output", "batches", BATCH_KEY);
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");
const DETAIL_CACHE_FILE = path.join(batchDir, "details.ndjson");

const REVIEW_MD = path.join(ROOT_DIR, "docs", "legacy-review-2015-2016.md");
const SAMPLE_MD = path.join(ROOT_DIR, "docs", "legacy-sample-check-2015-2016.md");

function snippet(text, n = 160) {
  if (!text) return "(vazio)";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

function suggestFor(reasons) {
  const joined = reasons.join(" | ");
  if (/data não encontrada|data da listagem/.test(joined)) return "precisa inspeção (divergência/ausência de data)";
  if (/corpo vazio ou suspeito/.test(joined)) return "conteúdo possivelmente não-matéria (corpo vazio ou quase vazio)";
  if (/nenhuma tag <p>/.test(joined)) return "corrigível (conteúdo real, mas em estrutura HTML inesperada — provável era antiga do CMS)";
  if (/fallback|host de mídia/.test(joined)) return "precisa inspeção (imagem fora do padrão esperado)";
  if (/estrutura ambígua/.test(joined)) return "precisa inspeção (estrutura de página duplicada/ambígua)";
  if (/bloco não-editorial|links para \d+ outras/.test(joined)) return "precisa inspeção (possível conteúdo não-editorial misturado ao corpo)";
  return "precisa inspeção";
}

function renderReviewCase(record, i) {
  const { candidate: c, detail, reasons } = record;
  const refs = detail ? collectImageRefs(detail) : [];
  return `### ${i + 1}. ${detail?.title || c.primary.title}

- **URL antiga:** ${c.primary.url}
- **Título (listagem):** ${c.primary.title}
- **Título (detalhe):** ${detail?.title ?? "(não extraído)"}
- **Data:** ${c.publishedIso} (bruto: \`${c.primary.listingDateRaw}\`)
- **Categoria:** ${c.primary.category}${c.allCategories.length > 1 ? ` (também em: ${c.allCategories.filter((x) => x !== c.primary.category).join(", ")})` : ""}
- **Motivo(s) da barreira:** ${reasons.join("; ")}
- **Estrutura encontrada:** entry-header=${detail?.entryHeaderCount ?? "?"}, entry-content=${detail?.entryContentCount ?? "?"}, parágrafos=${detail?.bodyParagraphCount ?? "?"}
- **Tamanho do corpo:** ${detail?.bodyTextFull?.length ?? 0} caractere(s) de texto
- **Imagens:** ${refs.length} referência(s) — capa: ${detail?.coverUrl ?? "nenhuma"} (origem: ${detail?.coverSource ?? "n/a"})
- **Trecho do conteúdo encontrado:** "${snippet(detail?.bodyTextFull)}"
- **Sugestão:** ${suggestFor(reasons)}
`;
}

async function buildReviewDoc(needsReviewList) {
  const header = `# Revisão manual — lote 2015-2016 (${needsReviewList.length} casos)

Gerado em: ${new Date().toISOString()}

Estes casos foram marcados \`needs_review\` pela barreira de integridade editorial (\`scripts/legacy-audit/lib/integrity.mjs\`) e **não foram importados automaticamente**. Nenhuma decisão foi tomada aqui — cada caso precisa de revisão humana antes de decidir se entra (corrigido manualmente) ou fica de fora.

---

`;
  const body = needsReviewList.map(renderReviewCase).join("\n---\n\n");
  await writeFile(REVIEW_MD, header + body, "utf8");
  console.log(`Revisão manual escrita em ${REVIEW_MD} (${needsReviewList.length} casos)`);
}

// Amostra determinística (item 9): distribuída entre as 4 editorias reais
// do lote, espalhada por 2015 e 2016 — nunca aleatória (mesma entrada
// sempre produz a mesma amostra).
const SAMPLE_TARGETS = { geral: 12, esporte: 6, politica: 6, sociais: 6 };

function pickSample(eligibleList) {
  const bySection = {};
  for (const rec of eligibleList) {
    const slug = CATEGORY_TO_SECTION_SLUG[rec.candidate.primary.category];
    bySection[slug] ??= [];
    bySection[slug].push(rec);
  }
  const picked = [];
  for (const [slug, target] of Object.entries(SAMPLE_TARGETS)) {
    const pool = (bySection[slug] ?? []).slice().sort((a, b) => (a.candidate.publishedIso < b.candidate.publishedIso ? -1 : 1));
    if (pool.length === 0) continue;
    const step = Math.max(1, Math.floor(pool.length / target));
    for (let i = 0; i < pool.length && picked.filter((p) => CATEGORY_TO_SECTION_SLUG[p.candidate.primary.category] === slug).length < target; i += step) {
      picked.push(pool[i]);
    }
  }
  return picked;
}

function renderSampleRow(rec, i) {
  const { candidate: c, detail } = rec;
  const refs = detail ? collectImageRefs(detail) : [];
  const bodyText = detail?.bodyTextFull ?? "";
  const start = snippet(bodyText, 120);
  const end = bodyText.length > 240 ? "…" + bodyText.slice(-120).trim() : "";
  return `### ${i + 1}. ${detail?.title || c.primary.title}

- **URL antiga:** ${c.primary.url}
- **Título (listagem):** ${c.primary.title}
- **Título (detalhe):** ${detail?.title ?? "(não extraído)"}
- **Data (listagem):** ${c.primary.listingDateRaw}
- **Data (detalhe):** ${detail?.publishedRaw ?? "(não extraído)"}
- **Editoria destino:** ${CATEGORY_TO_SECTION_SLUG[c.primary.category]}
- **Início do texto:** "${start}"
- **Final do texto:** "${end || "(mesmo trecho acima — corpo curto)"}"
- **Capa:** ${detail?.coverUrl ?? "nenhuma"}
- **Nº de imagens:** ${refs.length}
- **sourceLabel (autor/fonte original):** ${detail?.sourceLabel ?? "(nenhum)"}
- **Verdict da integridade:** eligible
`;
}

async function buildSampleDoc(eligibleList) {
  const sample = pickSample(eligibleList);
  const header = `# Amostra de conferência — lote 2015-2016 (${sample.length} matérias elegíveis)

Gerado em: ${new Date().toISOString()}

Amostra determinística (não aleatória — mesma entrada sempre produz a mesma seleção), distribuída entre as editorias reais do lote (Geral, Esporte, Política, Sociais) e espalhada entre 2015 e 2016. Objetivo: permitir conferência humana da qualidade da extração antes da primeira carga real. Nenhuma destas matérias foi gravada no Supabase.

---

`;
  const body = sample.map(renderSampleRow).join("\n---\n\n");
  await writeFile(SAMPLE_MD, header + body, "utf8");
  console.log(`Amostra de conferência escrita em ${SAMPLE_MD} (${sample.length} matérias)`);
}

async function main() {
  const allItems = await loadInventory(INVENTORY_FILE);
  const candidates = dedupeByIdentity(allItems);
  const { eligible: inRange } = filterByBatchRange(candidates, batch);
  const cache = await loadDetailCache(DETAIL_CACHE_FILE);
  const { eligibleList, needsReviewList } = classifyCandidates(inRange, cache);

  console.log(`eligible=${eligibleList.length} needsReview=${needsReviewList.length}`);
  await buildReviewDoc(needsReviewList);
  await buildSampleDoc(eligibleList);
}

main().catch((error) => {
  console.error("Falha ao gerar relatórios:", error);
  process.exitCode = 1;
});
