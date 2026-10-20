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

/**
 * Troca a capa. A capa anterior nunca é descartada — vira o primeiro item
 * da galeria (Fase 26, item 6: "ao trocar a capa, a capa anterior deve
 * continuar vinculada como galeria"). Se a nova capa já estava na galeria,
 * ela só muda de papel — nunca fica duplicada.
 */
export function setCoverMedia(media: ArticleMedia[], mediaAssetId: string): ArticleMedia[] {
  const previousCover = media.find((item) => item.role === "cover");
  const nextCover = media.find((item) => item.mediaAssetId === mediaAssetId);
  if (previousCover?.mediaAssetId === mediaAssetId) return media;
  const withoutNewCoverOrOldCover = media.filter(
    (item) => item.mediaAssetId !== mediaAssetId && item.role !== "cover",
  );
  const gallery = withoutNewCoverOrOldCover
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order);
  const promotedOldCover: ArticleMedia[] =
    previousCover && previousCover.mediaAssetId !== mediaAssetId
      ? [{ ...previousCover, role: "gallery", order: 0 }]
      : [];
  const renumberedGallery = [...promotedOldCover, ...gallery].map((item, index) => ({ ...item, order: index }));
  // Preservar legenda/crédito específico da matéria ao promover uma
  // imagem da galeria; a foto anterior continua como primeira da galeria.
  return [{ ...(nextCover ?? { mediaAssetId }), role: "cover", order: 0 }, ...renumberedGallery];
}

function normalizeOrderedMedia(items: ArticleMedia[]): ArticleMedia[] {
  return items.map((item, index) =>
    index === 0
      ? { ...item, role: "cover", order: 0 }
      : { ...item, role: "gallery", order: index - 1 },
  );
}

export function removeCoverMedia(media: ArticleMedia[]): ArticleMedia[] {
  const gallery = media
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order);
  return normalizeOrderedMedia(gallery);
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

/**
 * Troca o `mediaAssetId` de UM slot específico (capa, ou uma posição exata
 * da galeria) por uma mídia derivada — nunca por asset id "cego", porque a
 * mesma imagem original poderia (em tese) estar vinculada em mais de um
 * slot da mesma matéria; o editor de imagem só deve substituir o slot que o
 * usuário de fato abriu, preservando legenda/crédito/ordem desse slot.
 */
export function replaceMediaAssetAt(
  media: ArticleMedia[],
  target: { role: ArticleMedia["role"]; order: number },
  newMediaAssetId: string,
): ArticleMedia[] {
  return media.map((item) =>
    item.role === target.role && item.order === target.order
      ? { ...item, mediaAssetId: newMediaAssetId }
      : item,
  );
}

export function reorderArticleMedia(
  media: ArticleMedia[],
  draggedMediaAssetId: string,
  targetMediaAssetId: string,
  placement: "before" | "after",
): ArticleMedia[] {
  if (draggedMediaAssetId === targetMediaAssetId) return media;

  const cover = media.find((item) => item.role === "cover");
  const gallery = media
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order);
  const ordered = [...(cover ? [cover] : []), ...gallery];

  const draggedIndex = ordered.findIndex((item) => item.mediaAssetId === draggedMediaAssetId);
  if (draggedIndex === -1) return media;

  const [dragged] = ordered.splice(draggedIndex, 1);
  const targetIndex = ordered.findIndex((item) => item.mediaAssetId === targetMediaAssetId);
  if (targetIndex === -1) return media;

  const insertionIndex = targetIndex + (placement === "after" ? 1 : 0);
  ordered.splice(insertionIndex, 0, dragged);
  return normalizeOrderedMedia(ordered);
}


// Movimento por posição absoluta, para listas longas (30+ fotos) sem
// depender de arrastar uma imagem por toda a página. Índice 0 = capa;
// índices 1...N = galeria. Mantém ID, legenda, crédito e demais metadados.
export function moveArticleMediaToPosition(
  media: ArticleMedia[],
  mediaAssetId: string,
  targetPosition: number,
): ArticleMedia[] {
  const cover = media.find((item) => item.role === "cover");
  const gallery = media
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order);
  const ordered = [...(cover ? [cover] : []), ...gallery];
  const sourceIndex = ordered.findIndex((item) => item.mediaAssetId === mediaAssetId);
  if (sourceIndex === -1 || !Number.isInteger(targetPosition) ||
      targetPosition < 0 || targetPosition >= ordered.length ||
      sourceIndex === targetPosition) return media;
  const [item] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetPosition, 0, item);
  return normalizeOrderedMedia(ordered);
}
