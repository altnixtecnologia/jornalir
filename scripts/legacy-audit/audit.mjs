#!/usr/bin/env node
// Coletor read-only do site legado (Fase 34 — auditoria; reutilizável na
// Fase 35 para carga/sincronização real, sempre em modo audit/read-only
// aqui). NUNCA grava no Supabase, NUNCA baixa imagens, NUNCA altera o
// site antigo.
import { mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText, createRateLimiter } from "./lib/http.mjs";
import { parseListingMeta, parseListingItems, parseArticlePage, parseSitemapIndexCategories } from "./lib/parse.mjs";

const BASE = "https://www.informativoregional.net";
// fileURLToPath (não regex manual) — o caminho real do repo contém um
// espaço ("Informativo Regional"), que new URL() codifica como %20; usar
// só .pathname sem decodificar grava tudo num diretório errado, literal
// com "%20" no nome (bug real encontrado na primeira execução da Fase 34).
const OUT_DIR = fileURLToPath(new URL("./output", import.meta.url));
const CHECKPOINT_DIR = fileURLToPath(new URL("./checkpoints", import.meta.url));
const INVENTORY_FILE = path.join(OUT_DIR, "inventory.ndjson");
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, "checkpoint.json");
const DETAIL_SAMPLE_FILE = path.join(OUT_DIR, "detail-samples.json");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const PAGES_LIMIT = args["pages-limit"] ? Number(args["pages-limit"]) : Infinity;
const SAMPLE_DETAIL = args["sample-detail"] ? Number(args["sample-detail"]) : 2;
const RPS = args.rps ? Number(args.rps) : 4;

// Categorias conhecidas do menu principal + achadas via sitemap índice
// (item 2 — nunca assumir que são só as já conhecidas). `colunistas` tem
// sub-colunas próprias, cada uma com paginação/total independentes.
const MAIN_CATEGORIES = ["geral", "esportes", "policia", "politica", "saude", "sociais"];
const COLUNISTAS_SUBPATHS = ["roni_raupp", "apae_de_sao_joao_do_sul", "outras", "informativo_contabil"];

async function discoverCategories() {
  const { ok, text } = await fetchText(`${BASE}/sitemap_index.xml`);
  const fromSitemap = ok ? parseSitemapIndexCategories(text) : [];
  const known = new Set([...MAIN_CATEGORIES, "colunistas"]);
  const extra = fromSitemap.filter((slug) => !known.has(slug));
  return { mainCategories: MAIN_CATEGORIES, extraCategories: extra };
}

function categoryPath(category) {
  return category.includes("/") ? category : category;
}

async function fetchListingMeta(categoryPath, throttle) {
  await throttle();
  const { ok, text } = await fetchText(`${BASE}/${categoryPath}/?pagina=1&filtro=antigos`);
  if (!ok) return { total: null, lastPage: null, error: true };
  return parseListingMeta(text);
}

async function crawlCategoryListings(categoryPath, lastPage, throttle, checkpoint, log) {
  const done = checkpoint.pagesDone[categoryPath] ?? [];
  const doneSet = new Set(done);
  const pagesToFetch = Math.min(lastPage, PAGES_LIMIT);

  for (let page = 1; page <= pagesToFetch; page += 1) {
    if (doneSet.has(page)) continue;
    await throttle();
    const url = `${BASE}/${categoryPath}/?pagina=${page}&filtro=antigos`;
    const { ok, text, status } = await fetchText(url);
    if (!ok) {
      log(`  [erro] ${categoryPath} pagina=${page} status=${status}`);
      checkpoint.errors.push({ categoryPath, page, status: status ?? 0 });
      continue;
    }
    const items = parseListingItems(text, categoryPath);
    if (items.length > 0) {
      const lines = items.map((item) => JSON.stringify(item)).join("\n") + "\n";
      await appendFile(INVENTORY_FILE, lines, "utf8");
    }
    doneSet.add(page);
    checkpoint.pagesDone[categoryPath] = [...doneSet];
    checkpoint.totalItemsFound += items.length;
    if (page % 25 === 0 || page === pagesToFetch) {
      await saveCheckpoint(checkpoint);
      log(`  ${categoryPath}: página ${page}/${pagesToFetch} (${items.length} itens nesta página)`);
    }
  }
}

async function saveCheckpoint(checkpoint) {
  await writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), "utf8");
}

async function loadCheckpoint() {
  if (existsSync(CHECKPOINT_FILE)) {
    return JSON.parse(await readFile(CHECKPOINT_FILE, "utf8"));
  }
  return { pagesDone: {}, totalItemsFound: 0, errors: [], categories: {} };
}

async function sampleArticleDetails(categoryPath, sampleUrls, throttle, log) {
  const samples = [];
  for (const url of sampleUrls) {
    await throttle();
    const { ok, text, status } = await fetchText(url);
    if (!ok) {
      samples.push({ url, error: `status ${status}` });
      continue;
    }
    const detail = parseArticlePage(text, url);
    samples.push(detail);
  }
  log(`  ${categoryPath}: ${samples.length} matéria(s) com extração completa de amostra`);
  return samples;
}

function pickSampleUrls(inventoryItemsForCategory, n) {
  if (inventoryItemsForCategory.length === 0) return [];
  const step = Math.max(1, Math.floor(inventoryItemsForCategory.length / n));
  const picks = [];
  for (let i = 0; i < inventoryItemsForCategory.length && picks.length < n; i += step) {
    picks.push(inventoryItemsForCategory[i].url);
  }
  return picks;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  if (!existsSync(INVENTORY_FILE)) await writeFile(INVENTORY_FILE, "", "utf8");

  const throttle = createRateLimiter(RPS);
  const log = (...msg) => console.log(...msg);

  log("== Fase 34 — auditoria do site legado (audit/read-only) ==");
  log(`rps=${RPS} pages-limit=${PAGES_LIMIT === Infinity ? "sem limite" : PAGES_LIMIT} sample-detail=${SAMPLE_DETAIL}`);

  const { mainCategories, extraCategories } = await discoverCategories();
  if (extraCategories.length > 0) {
    log(`Categorias extras encontradas via sitemap (fora do menu principal): ${extraCategories.join(", ")}`);
  }

  const categoryPaths = [
    ...mainCategories,
    ...extraCategories,
    ...COLUNISTAS_SUBPATHS.map((sub) => `colunistas/${sub}`),
  ];

  const checkpoint = await loadCheckpoint();

  for (const catPath of categoryPaths) {
    log(`\n-- ${catPath} --`);
    if (!checkpoint.categories[catPath]) {
      const meta = await fetchListingMeta(catPath, throttle);
      checkpoint.categories[catPath] = meta;
      await saveCheckpoint(checkpoint);
      log(`  total oficial: ${meta.total ?? "desconhecido"} | última página: ${meta.lastPage ?? "desconhecida"}`);
    }
    const meta = checkpoint.categories[catPath];
    if (!meta.lastPage) {
      log(`  [aviso] não foi possível determinar paginação — pulando listagem.`);
      continue;
    }
    await crawlCategoryListings(catPath, meta.lastPage, throttle, checkpoint, log);
  }

  await saveCheckpoint(checkpoint);
  log("\n== Listagens concluídas — iniciando amostra de extração completa por categoria ==");

  // Amostra de extração completa (item 3/7) — nunca o acervo inteiro
  // nesta fase (ver docs/legacy-audit.md, seção "Cobertura").
  const inventoryByCategory = await groupInventoryByCategory();
  const detailSamples = {};
  for (const catPath of categoryPaths) {
    const items = inventoryByCategory[catPath] ?? [];
    const sampleUrls = pickSampleUrls(items, SAMPLE_DETAIL);
    if (sampleUrls.length === 0) continue;
    detailSamples[catPath] = await sampleArticleDetails(catPath, sampleUrls, throttle, log);
  }
  await writeFile(DETAIL_SAMPLE_FILE, JSON.stringify(detailSamples, null, 2), "utf8");

  log("\n== Concluído. Rode `node analyze.mjs` para gerar o relatório. ==");
}

async function groupInventoryByCategory() {
  const raw = await readFile(INVENTORY_FILE, "utf8");
  const byCategory = {};
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    byCategory[item.category] ??= [];
    byCategory[item.category].push(item);
  }
  return byCategory;
}

main().catch((error) => {
  console.error("Falha na auditoria:", error);
  process.exitCode = 1;
});
