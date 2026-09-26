#!/usr/bin/env node
// Checagem SOMENTE LEITURA do estado real do Supabase relacionado à
// migração do legado (Fase 35C, item explícito da revisão do ChatGPT:
// "validar diretamente o estado final do Supabase, não apenas os
// contadores do script"). Nunca grava nada. Requer SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY no ambiente (nunca imprime a chave).
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente (--env-file).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const [{ count: articlesLegacy }, { count: sources }, { count: mediaWithOrigin }, { count: articleMedia }, { data: batches }] = await Promise.all([
    sb.from("articles").select("id", { count: "exact", head: true }).eq("origin", "legacy_site"),
    sb.from("article_external_sources").select("id", { count: "exact", head: true }).eq("provider", "informativo_regional_legacy"),
    sb.from("media_assets").select("id", { count: "exact", head: true }).not("origin_source_url", "is", null),
    sb.from("article_media").select("id", { count: "exact", head: true }),
    sb.from("legacy_migration_batches").select("batch_key, status, imported_articles, skipped_existing, failed_articles, migrated_images, reused_images, failed_images, expected_articles, expected_image_references"),
  ]);

  console.log(
    JSON.stringify(
      {
        articles_origin_legacy_site: articlesLegacy,
        article_external_sources_legacy: sources,
        media_assets_with_origin_source_url: mediaWithOrigin,
        article_media_total: articleMedia,
        legacy_migration_batches: batches,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("Falha na checagem:", e.message);
  process.exit(1);
});
