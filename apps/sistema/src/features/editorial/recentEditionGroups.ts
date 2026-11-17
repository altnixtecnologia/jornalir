import type { NewspaperEdition } from "@ir/types";

/** Apenas edições efetivamente vinculadas; ordem por número, não por cadastro. */
export function pickRecentEditionIds(
  rows: readonly { newspaper_edition_id: string | null }[],
  editions: readonly Pick<NewspaperEdition, "id" | "editionNumber">[],
  limit = 6,
): string[] {
  const withMedia = new Set(rows.map((row) => row.newspaper_edition_id).filter((id): id is string => Boolean(id)));
  return [...editions].filter((edition) => withMedia.has(edition.id))
    .sort((a, b) => b.editionNumber - a.editionNumber)
    .slice(0, limit).map((edition) => edition.id);
}
