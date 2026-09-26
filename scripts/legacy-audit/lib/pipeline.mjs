// Pipeline compartilhado (Fase 35B) entre migrate.mjs e os scripts de
// relatório humano (report-*.mjs) — garante que a lista "eligible" que o
// ChatGPT vê nos relatórios é EXATAMENTE a mesma que o importador usaria,
// nunca uma reimplementação divergente.
import { readFile } from "node:fs/promises";
import { externalIdentity } from "./identity.mjs";
import { CATEGORY_PRIORITY } from "./batches.mjs";
import { assessArticleIntegrity } from "./integrity.mjs";
import { parseBrDateTime } from "./dates.mjs";

export async function loadInventory(inventoryFile) {
  const raw = await readFile(inventoryFile, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

export function dedupeByIdentity(items) {
  const byIdentity = new Map();
  for (const item of items) {
    const identity = externalIdentity(item);
    const key = identity.externalId ? `id:${identity.externalId}` : `url:${identity.normalizedUrl}`;
    if (!byIdentity.has(key)) byIdentity.set(key, { identity, items: [item] });
    else byIdentity.get(key).items.push(item);
  }
  const candidates = [];
  for (const { identity, items: group } of byIdentity.values()) {
    const primary = [...group].sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category))[0];
    const allCategories = [...new Set(group.map((g) => g.category))];
    candidates.push({ identity, primary, allCategories, listingItems: group });
  }
  return candidates;
}

export function filterByBatchRange(candidates, batch) {
  const eligible = [];
  const dateExceptions = [];
  const outOfRange = [];
  for (const c of candidates) {
    const parsed = parseBrDateTime(c.primary.listingDateRaw);
    if (!parsed) {
      outOfRange.push(c);
      continue;
    }
    if (parsed.isBug) {
      dateExceptions.push({ ...c, rawDate: c.primary.listingDateRaw });
      continue;
    }
    if (parsed.dateIso >= batch.start && parsed.dateIso <= batch.end) {
      eligible.push({ ...c, publishedIso: parsed.dateIso });
    } else {
      outOfRange.push(c);
    }
  }
  return { eligible, dateExceptions, outOfRange };
}

export function candidateKey(c) {
  return c.identity.externalId ? `id:${c.identity.externalId}` : `url:${c.identity.normalizedUrl}`;
}

export function collectImageRefs(detail) {
  const refs = [];
  if (detail.coverUrl) refs.push({ role: "cover", src: detail.coverUrl, caption: detail.coverCaption, credit: null });
  for (const g of detail.galleryImages ?? []) {
    if (g.src === detail.coverUrl) continue;
    refs.push({ role: "gallery", src: g.src, caption: g.caption, credit: g.credit });
  }
  return refs;
}

/** Classifica candidatas do intervalo usando a MESMA barreira de
 * integridade que o importador usa — nunca uma cópia divergente. */
export function classifyCandidates(inRangeCandidates, detailCache) {
  const eligibleList = [];
  const needsReviewList = [];
  const quarantinedList = [];
  const rejectedList = [];
  for (const c of inRangeCandidates) {
    const key = candidateKey(c);
    const detail = detailCache.get(key);
    const { verdict, reasons } = assessArticleIntegrity(c, detail);
    const record = { candidate: c, detail, reasons };
    if (verdict === "eligible") eligibleList.push(record);
    else if (verdict === "needs_review") needsReviewList.push(record);
    else if (verdict === "quarantined") quarantinedList.push(record);
    else rejectedList.push(record);
  }
  return { eligibleList, needsReviewList, quarantinedList, rejectedList };
}

export async function loadDetailCache(detailCacheFile) {
  const cache = new Map();
  try {
    const raw = await readFile(detailCacheFile, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      cache.set(row.key, row.detail);
    }
  } catch {
    // cache pode não existir ainda — chamador decide o que fazer.
  }
  return cache;
}
