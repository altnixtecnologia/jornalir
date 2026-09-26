import { createHash } from "node:crypto";

const PROVIDER = "informativo_regional_legacy";

/** Remove querystring/hash/trailing slash — mesma matéria não pode virar
 * duas identidades por causa de "?utm=..." ou barra final (item 5). */
export function normalizeUrl(url) {
  const u = new URL(url);
  u.search = "";
  u.hash = "";
  let path = u.pathname.replace(/\/+$/, "");
  return `${u.origin}${path}`;
}

function sha1(input) {
  return createHash("sha1").update(input).digest("hex");
}

/** Identidade externa estável: preferir external_id (id numérico do
 * legado); cair para URL normalizada só quando não existir (item 5). */
export function externalIdentity(item) {
  const url = normalizeUrl(item.url);
  return {
    provider: PROVIDER,
    externalId: item.externalId || null,
    sourceUrl: item.externalId ? null : url,
    // guardado sempre, mesmo quando externalId existe, para dedupe local
    // e para popular article_external_sources.source_url.
    normalizedUrl: url,
  };
}

/** Hash estável do conteúdo bruto relevante — usado para source_hash
 * (permite detectar se uma re-sincronização futura mudou algo real). */
export function sourceHash(item, detail) {
  const payload = JSON.stringify({
    title: detail?.title ?? item.title,
    subtitle: detail?.subtitle ?? null,
    body: detail?.bodyTextSample ?? null,
    publishedRaw: item.listingDateRaw,
    category: item.category,
  });
  return sha1(payload);
}

const NON_ALNUM = /[^a-z0-9]+/g;

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(NON_ALNUM, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Slug único e ESTÁVEL (item 6): mesma matéria reprocessada gera sempre o
 * mesmo slug, sem depender da ordem de importação e sem número aleatório.
 * Base = slug original do legado (se existir) ou o título; sufixo
 * determinístico = external_id real quando existir, senão os 8
 * primeiros caracteres do sha1 da URL normalizada.
 */
export function stableSlug(item) {
  const base = slugify(item.slug || item.title || "materia");
  const suffix = item.externalId ? item.externalId : sha1(normalizeUrl(item.url)).slice(0, 8);
  return `${base}-${suffix}`;
}

export { PROVIDER };
