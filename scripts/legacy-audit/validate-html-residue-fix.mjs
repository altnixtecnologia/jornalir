#!/usr/bin/env node
// Fase 44D — validação pós-correção dos 203 registros de 2019-2020.
// Só faz SELECTs; nenhuma escrita.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PROVIDER } from "./lib/identity.mjs";
import { getBatch } from "./lib/batches.mjs";
import { loadInventory, dedupeByIdentity, filterByBatchRange, candidateKey, loadDetailCache } from "./lib/pipeline.mjs";
import { sanitizeBodyHtml } from "./lib/sanitize.mjs";

const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");
const BATCH_KEY = "2019-2020";
const DETAIL_CACHE_FILE = path.join(AUDIT_DIR, "output", "batches", BATCH_KEY, "details.ndjson");

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}


async function main() {
  const sb = supabaseAdmin();

  const inventory = await loadInventory(INVENTORY_FILE);
  const candidates = dedupeByIdentity(inventory);
  const batch = getBatch(BATCH_KEY);
  const { eligible: inRange } = filterByBatchRange(candidates, batch);
  const detailCache = await loadDetailCache(DETAIL_CACHE_FILE);

  const targets = [];
  for (const c of inRange) {
    const key = candidateKey(c);
    const detail = detailCache.get(key);
    if (!detail?.bodyHtml) continue;
    const { removedCount } = sanitizeBodyHtml(detail.bodyHtml);
    if (removedCount === 0) continue;
    targets.push({ externalId: c.identity.externalId, title: detail.title });
  }
  console.log(`1) Alvos esperados (do cache): ${targets.length}`);

  let stillLeaking = [];
  let correctedCount = 0;
  let notFound = [];
  for (const t of targets) {
    const { data: sourceRow, error: sErr } = await sb
      .from("article_external_sources")
      .select("article_id, source_hash")
      .eq("provider", PROVIDER)
      .eq("external_id", t.externalId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sourceRow) { notFound.push(t.externalId); continue; }
    const { data: articleRow, error: aErr } = await sb
      .from("articles")
      .select("body, status, archived_at")
      .eq("id", sourceRow.article_id)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!articleRow) { notFound.push(t.externalId); continue; }
    const { removedCount: remaining } = sanitizeBodyHtml(articleRow.body || "");
    if (remaining > 0) {
      stillLeaking.push({ externalId: t.externalId, title: t.title });
    } else {
      correctedCount += 1;
    }
  }

  console.log(`2) Corrigidos (sem mais resíduo no body): ${correctedCount}`);
  console.log(`3) Ainda com resíduo (não deveria haver nenhum): ${stillLeaking.length}`);
  if (stillLeaking.length) console.log(JSON.stringify(stillLeaking, null, 2));
  console.log(`4) Não encontrados no banco (inesperado): ${notFound.length}`);

  const { count: totalArticles, error: totalErr } = await sb.from("articles").select("id", { count: "exact", head: true });
  if (totalErr) throw totalErr;
  console.log(`5) Total físico de articles (deve ser igual antes/depois — nada foi criado/apagado): ${totalArticles}`);

  const { count: totalSources, error: srcErr } = await sb.from("article_external_sources").select("id", { count: "exact", head: true });
  if (srcErr) throw srcErr;
  console.log(`6) Total de article_external_sources (deve ser igual antes/depois): ${totalSources}`);

  const { count: totalMedia, error: mediaErr } = await sb.from("article_media").select("id", { count: "exact", head: true });
  if (mediaErr) throw mediaErr;
  console.log(`7) Total de article_media (deve ser igual — nenhuma mídia tocada): ${totalMedia}`);

  const { data: batchRow, error: batchErr } = await sb
    .from("legacy_migration_batches")
    .select("status, imported_articles, skipped_existing, failed_articles, migrated_images, reused_images, failed_images")
    .eq("batch_key", BATCH_KEY)
    .maybeSingle();
  if (batchErr) throw batchErr;
  console.log(`8) legacy_migration_batches (2019-2020): ${JSON.stringify(batchRow)}`);
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
