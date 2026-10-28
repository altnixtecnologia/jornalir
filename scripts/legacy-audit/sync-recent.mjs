#!/usr/bin/env node
// Sincronizador incremental (pós-migração histórica 2015-2026 completa).
// Nunca varre o acervo inteiro: descobre a última matéria já importada no
// banco (article_external_sources, provider=informativo_regional_legacy),
// define um corte de segurança 1 dia antes dela, e percorre as listagens do
// site legado SÓ a partir da página mais recente de cada categoria,
// parando assim que uma página inteira fica mais velha que o corte.
//
// Reaproveita a MESMA barreira de integridade, identidade e motor de
// importação/upload R2 do migrate.mjs (via lib/importer.mjs e
// lib/pipeline.mjs) — nenhuma regra duplicada ou reimplementada aqui.
//
// Modos:
//   (sem --commit)        preflight — não grava nada, só mostra o que faria.
//   --commit              importa de verdade só as matérias novas elegíveis,
//                         como status=draft (padrão defensivo).
//   --commit --publish-recent
//                         importa de verdade já como status=published —
//                         decisão definitiva do proprietário (18/10/2026,
//                         Lote 3): comportamento histórico das importações
//                         do legado. Exige a flag explícita; sem ela,
//                         permanece draft mesmo com --commit.
//   --reconcile-existing  (com --commit) também reconcilia mídia das
//                         matérias já existentes na janela — fora do padrão.
//
// Uso:
//   node --env-file=.env.local scripts/legacy-audit/sync-recent.mjs
//   node --env-file=.env.local scripts/legacy-audit/sync-recent.mjs --commit --publish-recent
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchText, createRateLimiter } from "./lib/http.mjs";
import { parseListingItems, parseListingMeta, parseArticlePage } from "./lib/parse.mjs";
import { PROVIDER } from "./lib/identity.mjs";
import { CATEGORY_TO_SECTION_SLUG } from "./lib/batches.mjs";
import { parseBrDateTime } from "./lib/dates.mjs";
import { dedupeByIdentity, filterByBatchRange, candidateKey, collectImageRefs, classifyCandidates } from "./lib/pipeline.mjs";
import { supabaseAdmin, resolveGeralLocalityId, findExistingArticleId, importCandidate } from "./lib/importer.mjs";
import { loadManualArticles, partitionEligibleAgainstManual } from "./lib/manual-guard.mjs";

const BASE = "https://www.informativoregional.net";
const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const OUTPUT_DIR = path.join(AUDIT_DIR, "output");

// Mesmas categorias do mapeamento oficial (lib/batches.mjs), EXCETO
// "classificados" — nunca importado automaticamente (requisito explícito),
// então nem vale a pena rastrear a listagem dela aqui.
const CATEGORIES = Object.keys(CATEGORY_TO_SECTION_SLUG).filter((c) => c !== "classificados");
const MAX_PAGES_PER_CATEGORY = 30; // válvula de segurança — nunca deveria chegar perto disso num sync incremental real.

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const COMMIT = Boolean(args.commit);
const RPS = args.rps ? Number(args.rps) : 4;
// Item 4 (18/10/2026): por padrão, --commit NUNCA toca as matérias já
// existentes (só reconcilia mídia delas se isto for passado explicitamente).
const RECONCILE_EXISTING = Boolean(args["reconcile-existing"]);

// DECISÃO DEFINITIVA DO PROPRIETÁRIO (18/10/2026, Lote 3): o comportamento
// histórico das importações do site legado é nascer `published` (conteúdo
// que já esteve público por anos lá, mesmo princípio de migrate.mjs/
// ArticleService.importLegacyArticle) — reverte a decisão temporária do
// Lote 2 (draft), que havia sido aplicada por segurança até confirmação
// explícita. NUNCA um default implícito: "published" só é usado com
// --publish-recent explícito na linha de comando (a própria "confirmação
// para execução real" exigida); sem essa flag, o script continua
// defensivamente em "draft" — ver assertValidTargetStatus em
// lib/importer.mjs, que de qualquer forma rejeita qualquer chamada sem um
// valor explícito e válido, não dependendo nunca do default da função SQL.
const PUBLISH_RECENT = Boolean(args["publish-recent"]);
const SYNC_RECENT_TARGET_STATUS = PUBLISH_RECENT ? "published" : "draft";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Última matéria já importada deste provider — define o corte do sync.
 * Ignora registros com original_published_at NULO (nunca pode virar a
 * "última data" por ausência de valor — um NULL ordenado por engano pra
 * frente/trás faria o corte ficar errado em qualquer direção). */
export async function findCutoff(sb) {
  const { data: lastSource, error } = await sb
    .from("article_external_sources")
    .select("article_id, original_published_at, source_url, external_id")
    .eq("provider", PROVIDER)
    .not("original_published_at", "is", null)
    .order("original_published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!lastSource) {
    throw new Error(
      "Nenhuma matéria do provider informativo_regional_legacy encontrada em article_external_sources. " +
        "Este script é só para sincronização incremental PÓS-migração histórica — rode migrate.mjs primeiro.",
    );
  }

  let lastTitle = null;
  let lastSlug = null;
  if (lastSource.article_id) {
    const { data: art } = await sb.from("articles").select("title, slug").eq("id", lastSource.article_id).maybeSingle();
    lastTitle = art?.title ?? null;
    lastSlug = art?.slug ?? null;
  }

  const lastDateIso = (lastSource.original_published_at || "").slice(0, 10);
  const cutoffDateIso = addDays(lastDateIso || todayIso(), -1); // margem de segurança de 1 dia

  return {
    lastExisting: {
      title: lastTitle,
      slug: lastSlug,
      url: lastSource.source_url,
      originalPublishedAt: lastSource.original_published_at,
    },
    cutoffDateIso,
  };
}

/**
 * Percorre a listagem de UMA categoria. IMPORTANTE (descoberto na prática,
 * diferente do que o nome "filtro=antigos" sugere): `pagina=1` é a página
 * mais ANTIGA e `pagina=lastPage` é a mais RECENTE — dentro de cada página
 * os itens também vêm em ordem crescente de data (mais antigo primeiro).
 * Por isso o crawl começa no ÚLTIMO número de página (via `parseListingMeta`
 * da página 1, só para descobrir `lastPage` — não usa os itens dela) e
 * anda PRA TRÁS, parando assim que uma página inteira (até o item mais
 * recente dela, o último do array) já é mais velha que o corte.
 */
export async function crawlCategoryRecent(category, cutoffDateIso, throttle, log) {
  await throttle();
  const metaUrl = `${BASE}/${category}/?pagina=1&filtro=antigos`;
  const metaRes = await fetchText(metaUrl);
  if (!metaRes.ok) {
    log(`  [erro] ${category} (meta) status=${metaRes.status}`);
    return [];
  }
  const { lastPage } = parseListingMeta(metaRes.text);
  if (!lastPage) {
    log(`  [aviso] ${category}: não foi possível descobrir a última página`);
    return [];
  }

  const items = [];
  const firstPageToFetch = lastPage;
  const lastPageToFetch = Math.max(1, lastPage - MAX_PAGES_PER_CATEGORY + 1);
  for (let page = firstPageToFetch; page >= lastPageToFetch; page -= 1) {
    await throttle();
    const url = `${BASE}/${category}/?pagina=${page}&filtro=antigos`;
    const { ok, text, status } = await fetchText(url);
    if (!ok) {
      log(`  [erro] ${category} pagina=${page} status=${status}`);
      break;
    }
    const pageItems = parseListingItems(text, category);
    if (pageItems.length === 0) {
      // O site legado às vezes anuncia um lastPage uma página além do fim
      // real (ex.: pagina=1386 vazia, enquanto 1385 contém os itens mais
      // recentes). Não encerrar o crawl no primeiro vazio: continua para a
      // página anterior, mantendo MAX_PAGES_PER_CATEGORY como válvula de
      // segurança para não varrer o acervo inteiro por engano.
      log(`  [aviso] ${category} pagina=${page}: vazia; tentando a página anterior`);
      continue;
    }
    items.push(...pageItems);

    const newestOnPage = pageItems[pageItems.length - 1];
    const parsed = parseBrDateTime(newestOnPage.listingDateRaw);
    // Ambíguo/bugado: por segurança, continua pra página anterior (nunca
    // para cedo demais por causa de uma data malformada). Só para quando
    // temos certeza de que a página inteira já é mais velha que o corte.
    const pageIsFullyBeforeCutoff = parsed && !parsed.isBug && parsed.dateIso < cutoffDateIso;
    if (pageIsFullyBeforeCutoff) break;
  }
  return items;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const log = (...m) => console.log(...m);
  const sb = supabaseAdmin(); // leitura precisa de service role mesmo no preflight.

  log(`== sync-recent — sincronização incremental do site legado (commit=${COMMIT}, targetStatus=${SYNC_RECENT_TARGET_STATUS}${PUBLISH_RECENT ? " [--publish-recent confirmado]" : " [sem --publish-recent — permanece draft]"}) ==`);

  const { lastExisting, cutoffDateIso } = await findCutoff(sb);
  log(`Última matéria já existente: "${lastExisting.title}" (${lastExisting.originalPublishedAt}) — ${lastExisting.url}`);
  log(`Data de corte (margem de 1 dia): ${cutoffDateIso}`);

  const throttle = createRateLimiter(RPS);
  const allItems = [];
  for (const category of CATEGORIES) {
    const items = await crawlCategoryRecent(category, cutoffDateIso, throttle, log);
    log(`  ${category}: ${items.length} item(ns) na janela recente`);
    allItems.push(...items);
  }
  log(`Total encontrado no site (todas categorias, antes de deduplicar): ${allItems.length}`);

  const candidates = dedupeByIdentity(allItems);
  const { eligible: inRange, dateExceptions } = filterByBatchRange(candidates, { start: cutoffDateIso, end: "2100-12-31" });
  log(`Candidatas únicas no intervalo recente: ${inRange.length} | exceções de data: ${dateExceptions.length}`);

  // Separa o que já existe no banco do que é potencialmente novo — a
  // barreira de integridade (classifyCandidates) só se aplica à decisão de
  // CRIAR uma matéria nova; uma já existente nunca precisa "passar" nela de
  // novo pra ter sua mídia reconciliada (requisito 4/7).
  const existingCandidates = [];
  const newCandidates = [];
  for (const c of inRange) {
    const existingId = await findExistingArticleId(sb, c.identity);
    if (existingId) existingCandidates.push({ ...c, existingArticleId: existingId });
    else newCandidates.push(c);
  }
  log(`Já existentes no banco: ${existingCandidates.length} | potencialmente novas: ${newCandidates.length}`);

  // Busca o detalhe de TODAS as candidatas da janela recente (novas E já
  // existentes) — nunca do acervo histórico inteiro, só do que foi
  // encontrado nesta janela. Já existentes precisam do detalhe pra
  // reconcileArticleImages saber quais imagens deveriam existir e completar
  // o que faltou numa execução anterior que falhou parcialmente (o
  // problema que esta correção resolve: antes, uma matéria já existente
  // nunca tinha a mídia reconciliada de novo).
  const detailCache = new Map();
  const detailFetchFailed = [];
  for (const c of inRange) {
    const key = candidateKey(c);
    await throttle();
    const { ok, text, status } = await fetchText(c.primary.url);
    if (!ok) {
      log(`  [erro] detalhe ${c.primary.url} status=${status}`);
      detailFetchFailed.push({ url: c.primary.url, status });
      continue;
    }
    detailCache.set(key, parseArticlePage(text, c.primary.url));
  }

  const { eligibleList: classifiedEligibleList, needsReviewList, quarantinedList, rejectedList } = classifyCandidates(newCandidates, detailCache);

  // Proteção mínima contra reimportar como "legado" uma matéria que já
  // existe com origin='manual' (28/10/2026) — nunca descarta: só tira da
  // lista "eligible" o que bate fortemente (título+data+conteúdo) e manda
  // pra revisão (manualDuplicateList/manualAmbiguousList), preservadas no
  // relatório. Ver lib/manual-guard.mjs.
  const manualArticles = await loadManualArticles(sb);
  const { finalEligible: eligibleList, manualDuplicateList, manualAmbiguousList } =
    partitionEligibleAgainstManual(classifiedEligibleList, manualArticles, detailCache, candidateKey);
  if (manualDuplicateList.length > 0 || manualAmbiguousList.length > 0) {
    log(`\n[manual-guard] ${manualDuplicateList.length} candidata(s) confirmada(s) como duplicata de matéria manual (fora da importação); ${manualAmbiguousList.length} ambígua(s) (título+data batendo, conteúdo não confirmou — fora da importação, aguardando revisão humana).`);
    for (const { candidate: c, manualMatch } of [...manualDuplicateList, ...manualAmbiguousList]) {
      log(`    - "${c.primary.title}" (${c.publishedIso}) ~ manual "${manualMatch.manualTitle}" (slug=${manualMatch.manualSlug}) sinais=${JSON.stringify(manualMatch.signals)}`);
    }
  }

  // Existentes recentes a reconciliar: só as que conseguiram detalhe —
  // quem falhou entra em `detailFetchFailed` (nunca recria/sobrescreve
  // conteúdo, só não reconcilia mídia nesta execução; uma reexecução
  // tenta de novo).
  const existingReconcileList = existingCandidates
    .map((c) => ({ candidate: c, detail: detailCache.get(candidateKey(c)) ?? null }))
    .filter((pair) => pair.detail !== null);
  const existingDetailFetchFailed = existingCandidates.filter((c) => !detailCache.has(candidateKey(c)));
  const existingDetailFailedCount = existingDetailFetchFailed.length;

  let totalImagesNewEligible = 0;
  for (const { detail } of eligibleList) totalImagesNewEligible += collectImageRefs(detail).length;
  let totalImagesExistingToReconcile = 0;
  for (const { detail } of existingReconcileList) totalImagesExistingToReconcile += collectImageRefs(detail).length;

  const preflight = {
    generatedAt: new Date().toISOString(),
    lastExisting,
    cutoffDateIso,
    foundOnSite: allItems.length,
    uniqueCandidatesInRange: inRange.length,
    dateExceptions: dateExceptions.length,
    alreadyExisting: existingCandidates.length,
    existingToReconcile: existingReconcileList.length,
    existingDetailFetchFailed: existingDetailFailedCount,
    newEligible: eligibleList.length,
    needsReview: needsReviewList.length,
    quarantined: quarantinedList.length,
    rejected: rejectedList.length,
    manualDuplicateConfirmed: manualDuplicateList.length,
    manualAmbiguous: manualAmbiguousList.length,
    totalImagesInNewEligible: totalImagesNewEligible,
    totalImagesInExistingToReconcile: totalImagesExistingToReconcile,
  };

  log("\n== PREFLIGHT ==");
  log(JSON.stringify(preflight, null, 2));

  const reportPath = path.join(OUTPUT_DIR, `sync-recent-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  if (!COMMIT) {
    // Simula item a item (sem gravar nada) exatamente a chamada que o
    // --commit faria, inclusive o guard de targetStatus — confirma por
    // execução real (não só por leitura de código) que as novas elegíveis
    // seriam criadas como rascunho, nunca publicadas (item do Lote 2,
    // 18/10/2026). existingReconcileList nunca entra aqui (seria
    // "reconciliaria", não "criaria" — e de qualquer forma preflight nunca
    // chama a RPC de qualquer jeito).
    log("\n== SIMULAÇÃO DRY-RUN (item a item, nada gravado) ==");
    const dryRunBatchStats = { imported: 0, skippedExisting: 0 };
    for (const { candidate: c, detail } of eligibleList) {
      await importCandidate(sb, c, detail, {
        sectionCache: new Map(), localityId: null, throttle, log,
        dryRun: true, batchStats: dryRunBatchStats, imageExceptionsFile: null,
        targetStatus: SYNC_RECENT_TARGET_STATUS, callerLabel: "sync-recent.mjs (preflight)",
      });
    }
    log(`Confirmado: ${eligibleList.length} matéria(s) seriam criadas com status="${SYNC_RECENT_TARGET_STATUS}".`);
    await writeFile(reportPath, JSON.stringify({
      mode: "preflight", preflight, targetStatus: SYNC_RECENT_TARGET_STATUS,
      manualDuplicateList: manualDuplicateList.map(({ candidate: c, manualMatch }) => ({ url: c.primary.url, title: c.primary.title, publishedIso: c.publishedIso, manualMatch })),
      manualAmbiguousList: manualAmbiguousList.map(({ candidate: c, manualMatch }) => ({ url: c.primary.url, title: c.primary.title, publishedIso: c.publishedIso, manualMatch })),
    }, null, 2), "utf8");
    log(`\nPreflight salvo em: ${reportPath}`);
    log("Nada foi gravado (modo preflight). Rode com --commit para importar as novas elegíveis.");
    return;
  }

  log("\n== IMPORTANDO (--commit) ==");
  const sectionCache = new Map();
  const localityId = await resolveGeralLocalityId(sb);
  const imageExceptionsFile = path.join(OUTPUT_DIR, "sync-recent-image-exceptions.ndjson");

  const stats = {
    imported: 0,
    skippedExisting: 0,
    failedArticles: 0,
    uploadedImages: 0,
    reusedImages: 0,
    alreadyLinkedImages: 0,
    correctedImages: 0,
    failedImages: 0,
  };
  const failures = [];

  // Novas elegíveis: importCandidate cria a matéria (RPC, status=rascunho —
  // ver SYNC_RECENT_TARGET_STATUS) e reconcilia a mídia. Já existentes na
  // janela: importCandidate detectaria existingId e SÓ reconciliaria
  // mídia/vínculos (nunca recria, nunca sobrescreve título/corpo/data) — mas
  // essa reconciliação fica de FORA por padrão (pedido explícito de
  // 18/10/2026: "separar as novas das existentes, não alterar mídia das 5
  // sem autorização posterior"). Só entra com --reconcile-existing explícito.
  const toProcess = RECONCILE_EXISTING ? [...eligibleList, ...existingReconcileList] : [...eligibleList];
  if (!RECONCILE_EXISTING && existingReconcileList.length > 0) {
    log(`\n[info] ${existingReconcileList.length} matéria(s) já existente(s) NÃO serão tocadas nesta execução (sem --reconcile-existing).`);
  }
  for (const { candidate: c, detail } of toProcess) {
    try {
      await importCandidate(sb, c, detail, {
        sectionCache,
        localityId,
        throttle,
        log,
        dryRun: false,
        batchStats: stats,
        imageExceptionsFile,
        targetStatus: SYNC_RECENT_TARGET_STATUS,
        callerLabel: "sync-recent.mjs",
      });
    } catch (error) {
      stats.failedArticles += 1;
      failures.push({ url: c.primary.url, error: error.message });
      log(`  [ERRO] ${c.primary.url}: ${error.message}`);
    }
  }
  for (const c of existingDetailFetchFailed) {
    stats.failedArticles += 1;
    failures.push({ url: c.primary.url, error: "detalhe não pôde ser buscado — mídia não reconciliada nesta execução, reexecute para tentar de novo" });
  }

  log("\n== RESULTADO DA IMPORTAÇÃO ==");
  log(JSON.stringify(stats, null, 2));

  await writeFile(
    reportPath,
    JSON.stringify({
      mode: "commit", preflight, importStats: stats, failures,
      manualDuplicateList: manualDuplicateList.map(({ candidate: c, manualMatch }) => ({ url: c.primary.url, title: c.primary.title, publishedIso: c.publishedIso, manualMatch })),
      manualAmbiguousList: manualAmbiguousList.map(({ candidate: c, manualMatch }) => ({ url: c.primary.url, title: c.primary.title, publishedIso: c.publishedIso, manualMatch })),
    }, null, 2),
    "utf8",
  );
  log(`\nRelatório salvo em: ${reportPath}`);
}

// Guarda de entry-point: executa main() só quando este arquivo é o script
// chamado diretamente (node sync-recent.mjs). Sem isto, importar
// findCutoff/crawlCategoryRecent de outro script (ex.: report-sync-recent.mjs,
// para reaproveitar a mesma descoberta sem duplicar lógica) disparava um
// segundo preflight completo como efeito colateral do próprio import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Falha no sync-recent:", error);
    process.exitCode = 1;
  });
}
