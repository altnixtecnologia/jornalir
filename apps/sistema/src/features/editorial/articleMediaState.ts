import type { ArticleMedia } from "@ir/types";

/** Converte imagens sugeridas por um candidato de importação em `ArticleMedia[]`: a primeira vira capa, as demais formam a galeria. */
export function suggestedIdsToArticleMedia(mediaAssetIds: string[]): ArticleMedia[] {
  return mediaAssetIds.map((mediaAssetId, index) =>
    index === 0
      ? { mediaAssetId, role: "cover", order: 0 }
      : { mediaAssetId, role: "gallery", order: index - 1 },
  );
}

function reindexGallery(media: ArticleMedia[]): ArticleMedia[] {
  const cover = media.filter((item) => item.role === "cover");
  const gallery = media
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
  return [...cover, ...gallery];
}

export function setCoverMedia(media: ArticleMedia[], mediaAssetId: string): ArticleMedia[] {
  const withoutCover = media.filter((item) => item.role !== "cover");
  return [...withoutCover, { mediaAssetId, role: "cover", order: 0 }];
}

export function removeCoverMedia(media: ArticleMedia[]): ArticleMedia[] {
  return media.filter((item) => item.role !== "cover");
}

export function addGalleryMedia(media: ArticleMedia[], mediaAssetId: string): ArticleMedia[] {
  const alreadyInGallery = media.some(
    (item) => item.role === "gallery" && item.mediaAssetId === mediaAssetId,
  );
  if (alreadyInGallery) return media;
  const galleryCount = media.filter((item) => item.role === "gallery").length;
  return [...media, { mediaAssetId, role: "gallery", order: galleryCount }];
}

export function removeGalleryMedia(media: ArticleMedia[], mediaAssetId: string): ArticleMedia[] {
  const remaining = media.filter(
    (item) => !(item.role === "gallery" && item.mediaAssetId === mediaAssetId),
  );
  return reindexGallery(remaining);
}

/** Sobrescreve, só para este uso, a legenda de uma mídia já selecionada (capa ou galeria). String vazia remove a sobrescrita, voltando à legenda padrão da mídia. */
export function setMediaCaption(media: ArticleMedia[], mediaAssetId: string, caption: string): ArticleMedia[] {
  return media.map((item) =>
    item.mediaAssetId === mediaAssetId ? { ...item, caption: caption.trim() || undefined } : item,
  );
}

/** Sobrescreve, só para este uso, o crédito de uma mídia já selecionada (capa ou galeria). String vazia remove a sobrescrita, voltando ao crédito padrão da mídia. */
export function setMediaCredit(media: ArticleMedia[], mediaAssetId: string, credit: string): ArticleMedia[] {
  return media.map((item) =>
    item.mediaAssetId === mediaAssetId ? { ...item, credit: credit.trim() || undefined } : item,
  );
}

export function moveGalleryMedia(
  media: ArticleMedia[],
  mediaAssetId: string,
  direction: -1 | 1,
): ArticleMedia[] {
  const cover = media.filter((item) => item.role === "cover");
  const gallery = media.filter((item) => item.role === "gallery").sort((a, b) => a.order - b.order);
  const index = gallery.findIndex((item) => item.mediaAssetId === mediaAssetId);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= gallery.length) return media;

  const reordered = [...gallery];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moved);
  const renumbered = reordered.map((item, position) => ({ ...item, order: position }));
  return [...cover, ...renumbered];
}
