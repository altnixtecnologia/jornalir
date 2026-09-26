#!/usr/bin/env node
// Gera os relatórios humanos de um lote (generalização de
// report-2015-2016.mjs para reuso em 2017-2018 e lotes futuros): preflight
// resumido, needs_review caso a caso, quarentena caso a caso, e amostra
// determinística dos eligible. Nunca decide nada, nunca importa.
// Uso: node report-batch.mjs --batch=2017-2018
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBatch, CATEGORY_TO_SECTION_SLUG } from "./lib/batches.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, classifyCandidates, collectImageRefs, loadDetailCache } from "./lib/pipeline.mjs";
import { normalizeUrl } from "./lib/identity.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const BATCH_KEY = args.batch;
if (!BATCH_KEY) {
  console.error("Uso: node report-batch.mjs --batch=2017-2018");
  process.exit(1);
}

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const batch = getBatch(BATCH_KEY);
const batchDir = path.join(AUDIT_DIR, "output", "batches", BATCH_KEY);
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");
const DETAIL_CACHE_FILE = path.join(batchDir, "details.ndjson");
const PREFLIGHT_FILE = path.join(batchDir, "preflight.json");

const PREFLIGHT_MD = path.join(ROOT_DIR, "docs", `legacy-preflight-${BATCH_KEY}.md`);
const REVIEW_MD = path.join(ROOT_DIR, "docs", `legacy-review-${BATCH_KEY}.md`);
const QUARANTINE_MD = path.join(ROOT_DIR, "docs", `legacy-quarantined-${BATCH_KEY}.md`);
const SAMPLE_MD = path.join(ROOT_DIR, "docs", `legacy-sample-check-${BATCH_KEY}.md`);

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
  const header = `# Revisão manual — lote ${BATCH_KEY} (${needsReviewList.length} casos)

Gerado em: ${new Date().toISOString()}

Estes casos foram marcados \`needs_review\` pela barreira de integridade editorial (\`scripts/legacy-audit/lib/integrity.mjs\`) e **não foram importados automaticamente**. Nenhuma decisão foi tomada aqui — cada caso precisa de revisão humana antes de decidir se entra (corrigido manualmente) ou fica de fora.

---

`;
  const body = needsReviewList.length > 0 ? needsReviewList.map(renderReviewCase).join("\n---\n\n") : "_Nenhum caso needs_review neste lote._\n";
  await writeFile(REVIEW_MD, header + body, "utf8");
  console.log(`Revisão manual escrita em ${REVIEW_MD} (${needsReviewList.length} casos)`);
}

function renderQuarantineCase(record, i) {
  const { candidate: c, detail, reasons } = record;
  const refs = detail ? collectImageRefs(detail) : [];
  return `### ${i + 1}. ${detail?.title || c.primary.title}

- **URL antiga:** ${c.primary.url}
- **Título:** ${detail?.title || c.primary.title}
- **Data:** ${c.publishedIso}
- **Categoria legada:** ${c.primary.category}
- **Motivo:** ${reasons.join("; ")}
- **Tamanho do corpo:** ${detail?.bodyTextFull?.length ?? 0} caractere(s)
- **Imagens:** ${refs.length}
- **Trecho:** "${snippet(detail?.bodyTextFull)}"
`;
}

async function buildQuarantineDoc(quarantinedList) {
  if (quarantinedList.length === 0) {
    await writeFile(QUARANTINE_MD, `# Quarentena editorial — lote ${BATCH_KEY}\n\nGerado em: ${new Date().toISOString()}\n\nNenhum item em quarentena neste lote.\n`, "utf8");
    console.log(`Quarentena escrita em ${QUARANTINE_MD} (0 casos)`);
    return;
  }
  const byCategory = {};
  for (const rec of quarantinedList) {
    byCategory[rec.candidate.primary.category] ??= [];
    byCategory[rec.candidate.primary.category].push(rec);
  }
  const header = `# Quarentena editorial — lote ${BATCH_KEY} (${quarantinedList.length} itens)

Gerado em: ${new Date().toISOString()}

Estes itens pertencem a categorias em quarentena editorial (\`lib/integrity.mjs\`: \`classificados\` sempre; \`agricultura\` até amostragem/revisão da categoria inteira) — **nenhum foi importado**, independentemente de terem passado ou não nas demais checagens estruturais.

Categorias encontradas neste lote em quarentena: ${Object.keys(byCategory).join(", ")}.

Esta é a amostra/revisão da categoria pedida antes de liberar \`agricultura\` para importação (quando/se for decidido liberar) — nenhuma decisão de liberação foi tomada aqui.

---

`;
  const body = quarantinedList.map(renderQuarantineCase).join("\n---\n\n");
  await writeFile(QUARANTINE_MD, header + body, "utf8");
  console.log(`Quarentena escrita em ${QUARANTINE_MD} (${quarantinedList.length} casos)`);
}

const SAMPLE_TARGETS_BY_SECTION_COUNT = 30;

function pickSample(eligibleList) {
  const bySection = {};
  for (const rec of eligibleList) {
    const slug = CATEGORY_TO_SECTION_SLUG[rec.candidate.primary.category];
    bySection[slug] ??= [];
    bySection[slug].push(rec);
  }
  const sections = Object.keys(bySection);
  const perSection = Math.max(1, Math.floor(SAMPLE_TARGETS_BY_SECTION_COUNT / sections.length));
  const picked = [];
  for (const slug of sections) {
    const pool = bySection[slug].slice().sort((a, b) => (a.candidate.publishedIso < b.candidate.publishedIso ? -1 : 1));
    const step = Math.max(1, Math.floor(pool.length / perSection));
    let count = 0;
    for (let i = 0; i < pool.length && count < perSection; i += step) {
      picked.push(pool[i]);
      count += 1;
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
  const header = `# Amostra de conferência — lote ${BATCH_KEY} (${sample.length} matérias elegíveis)

Gerado em: ${new Date().toISOString()}

Amostra determinística (não aleatória), distribuída entre as editorias reais do lote e espalhada pelo período. Objetivo: permitir conferência humana da qualidade da extração antes da carga real. Nenhuma destas matérias foi gravada no Supabase.

---

`;
  const body = sample.map(renderSampleRow).join("\n---\n\n");
  await writeFile(SAMPLE_MD, header + body, "utf8");
  console.log(`Amostra de conferência escrita em ${SAMPLE_MD} (${sample.length} matérias)`);
}

async function buildPreflightDoc(summary, needsReviewList, quarantinedList) {
  const bySection = summary.distribuicaoPorEditoria;
  const md = `# Preflight — lote ${BATCH_KEY} (SOMENTE LEITURA, nada importado)

Gerado em: ${new Date().toISOString()}

Intervalo: ${batch.start} a ${batch.end}.

## Números do lote

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (deduplicadas por identidade) | ${summary.itemsFound} |
| Exceções de data (fora de qualquer lote automático) | ${summary.dateExceptions} |
| **Elegíveis** | **${summary.eligibleArticles}** |
| Precisam de revisão manual (\`needs_review\`) | ${summary.barreiraIntegridade.needsReview} |
| Em quarentena editorial (\`quarantined\`) | ${summary.barreiraIntegridade.quarantined} |
| Rejeitadas (falha de busca) | ${summary.barreiraIntegridade.rejected} |
| Com imagem | ${summary.withImage} |
| Sem imagem | ${summary.withoutImage} |
| Referências de imagem (elegíveis) | ${summary.totalImageReferences} |
| URLs de imagem únicas (elegíveis) | ${summary.uniqueImageUrls} |

## Distribuição por editoria (elegíveis)

${Object.entries(bySection).map(([slug, n]) => `- ${slug}: ${n}`).join("\n")}

## Categorias encontradas

- \`agricultura\` apareceu na distribuição por editoria acima? **${bySection.agricultura ? `Sim (${bySection.agricultura} itens, já revisada/liberada — ver REVIEWED_CATEGORIES em lib/integrity.mjs)` : "Não"}**.
- \`classificados\` apareceu neste lote (sempre em quarentena, nunca elegível automaticamente)? **${quarantinedList.length > 0 ? `Sim (${quarantinedList.length} itens)` : "Não"}** — ver \`legacy-quarantined-${BATCH_KEY}.md\`.
- \`classificados\` continua em quarentena automática em todos os lotes até revisão humana específica da categoria inteira.

## Localidade

Nenhuma inferência de localidade feita — todo o legado permanece \`Geral\` (regra fixa, não reavaliada por lote).

## Casos de revisão manual

${needsReviewList.length} casos — ver \`legacy-review-${BATCH_KEY}.md\`.

## Nenhuma escrita real

Esta etapa é somente leitura/preflight. Nenhuma matéria ou imagem foi importada.
`;
  await writeFile(PREFLIGHT_MD, md, "utf8");
  console.log(`Preflight escrito em ${PREFLIGHT_MD}`);
}

async function main() {
  const allItems = await loadInventory(INVENTORY_FILE);
  const candidates = dedupeByIdentity(allItems);
  const { eligible: inRange } = filterByBatchRange(candidates, batch);
  const cache = await loadDetailCache(DETAIL_CACHE_FILE);
  const { eligibleList, needsReviewList, quarantinedList } = classifyCandidates(inRange, cache);
  const summary = JSON.parse(await (await import("node:fs/promises")).readFile(PREFLIGHT_FILE, "utf8"));

  console.log(`eligible=${eligibleList.length} needsReview=${needsReviewList.length} quarantined=${quarantinedList.length}`);
  await buildPreflightDoc(summary, needsReviewList, quarantinedList);
  await buildReviewDoc(needsReviewList);
  await buildQuarantineDoc(quarantinedList);
  await buildSampleDoc(eligibleList);
}

main().catch((error) => {
  console.error("Falha ao gerar relatórios:", error);
  process.exitCode = 1;
});
