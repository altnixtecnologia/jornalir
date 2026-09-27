#!/usr/bin/env node
// Fase 44D — correção pontual dos artigos JÁ IMPORTADOS do lote 2019-2020
// que carregam o mesmo resíduo mecânico de <img> quebrada identificado na
// Fase 44C (ver docs/legacy-html-leak-analysis-2021-2022.md). Usa SOMENTE
// o cache local já existente (output/inventory.ndjson +
// output/batches/2019-2020/details.ndjson) — nenhum refetch, nenhuma
// reexecução do lote. Só toca `articles.body` e
// `article_external_sources.source_hash`, e SÓ quando o body atual no
// banco bater exatamente com o body antigo esperado do cache (evita
// sobrescrever qualquer edição manual feita depois da migração).
//
// Uso:
//   node --env-file=".env.local" fix-imported-html-residue.mjs            (dry-run, não grava)
//   node --env-file=".env.local" fix-imported-html-residue.mjs --commit   (grava de verdade)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sourceHash, PROVIDER } from "./lib/identity.mjs";
import { getBatch } from "./lib/batches.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, candidateKey, loadDetailCache } from "./lib/pipeline.mjs";
import { sanitizeBodyHtml, recomputeBodyTextFromHtml } from "./lib/sanitize.mjs";

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");
const BATCH_KEY = "2019-2020";
const DETAIL_CACHE_FILE = path.join(AUDIT_DIR, "output", "batches", BATCH_KEY, "details.ndjson");

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
  if (!url || !key) {
    throw new Error("SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente (--env-file=\".env.local\").");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  console.log(`== Fase 44D — correção pontual do resíduo HTML em ${BATCH_KEY} (já importado) — commit=${COMMIT} ==`);

  const inventory = await loadInventory(INVENTORY_FILE);
  const candidates = dedupeByIdentity(inventory);
  const batch = getBatch(BATCH_KEY);
  const { eligible: inRange } = filterByBatchRange(candidates, batch);
  const detailCache = await loadDetailCache(DETAIL_CACHE_FILE);

  console.log(`Candidatas no intervalo ${BATCH_KEY}: ${inRange.length} | detalhes em cache: ${detailCache.size}`);

  // Localiza, a partir do cache, todos os candidatos cujo bodyTextFull
  // ORIGINAL (nunca sanitizado — este cache nunca foi tocado) contém o
  // padrão de resíduo. Mesma regra usada na Fase 44C.
  const targets = [];
  for (const c of inRange) {
    const key = candidateKey(c);
    const detail = detailCache.get(key);
    if (!detail?.bodyHtml) continue;
    const { html: sanitizedHtml, removedCount } = sanitizeBodyHtml(detail.bodyHtml);
    if (removedCount === 0) continue;
    targets.push({ candidate: c, detail, sanitizedHtml, removedCount });
  }

  console.log(`Candidatos com resíduo detectado no cache: ${targets.length}`);

  const sb = supabaseAdmin();
  const plan = { willFix: [], manualConflict: [], notFoundInDb: [] };

  for (const t of targets) {
    const { candidate: c, detail, sanitizedHtml, removedCount } = t;
    const externalId = c.identity.externalId;

    const { data: sourceRow, error: sourceErr } = await sb
      .from("article_external_sources")
      .select("id, article_id, source_hash")
      .eq("provider", PROVIDER)
      .eq("external_id", externalId)
      .maybeSingle();
    if (sourceErr) throw sourceErr;
    if (!sourceRow) {
      plan.notFoundInDb.push({ externalId, title: detail.title, reason: "nenhuma linha em article_external_sources para este provider+external_id" });
      continue;
    }

    const { data: articleRow, error: articleErr } = await sb
      .from("articles")
      .select("id, body, status, archived_at")
      .eq("id", sourceRow.article_id)
      .maybeSingle();
    if (articleErr) throw articleErr;
    if (!articleRow) {
      plan.notFoundInDb.push({ externalId, title: detail.title, articleId: sourceRow.article_id, reason: "article_external_sources aponta para articles.id inexistente" });
      continue;
    }

    const expectedOldBody = detail.bodyHtml || "";
    const bodyMatches = articleRow.body === expectedOldBody;

    if (!bodyMatches) {
      plan.manualConflict.push({
        externalId,
        title: detail.title,
        articleId: articleRow.id,
        status: articleRow.status,
        reason: "body atual no banco diverge do body esperado do cache (possível edição manual pós-migração)",
        currentBodyLength: articleRow.body?.length ?? 0,
        expectedOldBodyLength: expectedOldBody.length,
      });
      continue;
    }

    const recomputed = recomputeBodyTextFromHtml(sanitizedHtml);
    const sanitizedDetailForHash = { ...detail, bodyTextFull: recomputed.bodyTextFull };
    const newHash = sourceHash(c.primary, sanitizedDetailForHash);

    plan.willFix.push({
      externalId,
      title: detail.title,
      articleId: articleRow.id,
      sourceRowId: sourceRow.id,
      status: articleRow.status,
      removedCount,
      oldHash: sourceRow.source_hash,
      newHash,
      sanitizedHtml,
    });
  }

  console.log(`\n== PLANO ==`);
  console.log(`Corrigíveis (body bate exatamente com o cache): ${plan.willFix.length}`);
  console.log(`Conflito manual (body diverge — NÃO tocar): ${plan.manualConflict.length}`);
  console.log(`Não encontrados no banco (inesperado): ${plan.notFoundInDb.length}`);

  if (plan.manualConflict.length > 0) {
    console.log("\nConflitos manuais:");
    for (const m of plan.manualConflict) console.log(`  - ${m.externalId} "${m.title}" — ${m.reason} (atual=${m.currentBodyLength} chars, esperado=${m.expectedOldBodyLength} chars)`);
  }
  if (plan.notFoundInDb.length > 0) {
    console.log("\nNão encontrados no banco:");
    for (const m of plan.notFoundInDb) console.log(`  - ${m.externalId} "${m.title}" — ${m.reason}`);
  }

  if (!COMMIT) {
    console.log("\n[DRY-RUN] Nenhuma escrita realizada. Rode novamente com --commit para aplicar os corrigíveis listados acima.");
    return { plan, applied: [] };
  }

  console.log(`\n== APLICANDO (--commit) — ${plan.willFix.length} registro(s) ==`);
  const applied = [];
  for (const f of plan.willFix) {
    const { error: bodyErr } = await sb.from("articles").update({ body: f.sanitizedHtml }).eq("id", f.articleId);
    if (bodyErr) throw bodyErr;
    const { error: hashErr } = await sb.from("article_external_sources").update({ source_hash: f.newHash }).eq("id", f.sourceRowId);
    if (hashErr) throw hashErr;
    applied.push(f);
    console.log(`  [ok] ${f.externalId} "${f.title}" — body e source_hash atualizados (${f.removedCount} fragmento(s) removido(s))`);
  }

  return { plan, applied };
}

main()
  .then((result) => {
    console.log("\n== RESUMO_JSON ==");
    console.log(JSON.stringify({
      willFix: result.plan.willFix.length,
      manualConflict: result.plan.manualConflict.map(({ externalId, title, reason }) => ({ externalId, title, reason })),
      notFoundInDb: result.plan.notFoundInDb.map(({ externalId, title, reason }) => ({ externalId, title, reason })),
      applied: result.applied.length,
    }, null, 2));
  })
  .catch((err) => {
    console.error("ERRO:", err);
    process.exit(1);
  });
