import type { SiteAdFitMode, SiteAdSlotTransitionEffect } from "@ir/types";

export interface AdCreative {
  id: string;
  imageUrl: string;
  href?: string;
  alt?: string;
  /** Duração/efeito/formato individuais desta imagem — sempre resolvidos (nunca undefined), já com o padrão da posição aplicado quando a imagem não tem configuração própria. */
  rotateMs: number;
  transitionEffect: SiteAdSlotTransitionEffect;
  fitMode: SiteAdFitMode;
}

export interface AdSlot {
  id: string;
  label: string;
  /** Padrão da posição — usado como fallback só quando uma imagem não traz seus próprios valores (nunca lido diretamente pelo AdSlotUnit, que sempre consulta a imagem atual). */
  rotateMs: number;
  phaseOffsetMs: number;
  transitionEffect: SiteAdSlotTransitionEffect;
  fitMode: SiteAdFitMode;
  creatives: AdCreative[];
}

function creative(folder: string, fileName: string, id: string): Omit<AdCreative, "rotateMs" | "transitionEffect" | "fitMode"> {
  return { id, imageUrl: "/uploads/anuncios/" + folder + "/" + encodeURIComponent(fileName) };
}

function fallbackSlot(
  id: number,
  label: string,
  rotateMs: number,
  phaseOffsetMs: number,
  creativesWithoutDefaults: Array<Omit<AdCreative, "rotateMs" | "transitionEffect" | "fitMode">>,
): AdSlot {
  const transitionEffect: SiteAdSlotTransitionEffect = "fade";
  const fitMode: SiteAdFitMode = "contain";
  return {
    id: "slot-" + id, label, rotateMs, phaseOffsetMs, transitionEffect, fitMode,
    creatives: creativesWithoutDefaults.map((item) => ({ ...item, rotateMs, transitionEffect, fitMode })),
  };
}

export const adSlots: AdSlot[] = [
  fallbackSlot(1, "Posição 1 - Esquerda", 7000, 0, [
    creative("grande1", "ANUNCIE NO JORNAL INFORMATIVO REGIONAL tamanho comercial.jpg", "s1-a"),
    creative("grande1", "cresol.jpg", "s1-b"),
    creative("grande1", "graxa seguros.jpg", "s1-c"),
  ]),
  fallbackSlot(2, "Posição 1 - Direita", 7600, 1200, [
    creative("grande2", "DUDA MOTOS CAR.jpg", "s2-a"),
    creative("grande2", "Funerária Catarinense.png", "s2-b"),
    creative("grande2", "godinho.jpg", "s2-c"),
  ]),
  fallbackSlot(3, "Posição 2 - Esquerda", 8200, 2400, [
    creative("grande3", "Despachante Santana.jpg", "s3-a"),
    creative("grande3", "PAGANINI TERRAPLANAGEM.jpg", "s3-b"),
    creative("grande3", "souza.jpg", "s3-c"),
  ]),
  fallbackSlot(4, "Posição 2 - Direita", 7300, 600, [
    creative("grande4", "magnus elétrica.png", "s4-a"),
    creative("grande4", "Ponto Net 578.jpg", "s4-b"),
    creative("grande4", "SEJOLAR.jpg", "s4-c"),
  ]),
  fallbackSlot(5, "Posição 3 - Esquerda", 7900, 1800, [
    creative("pequena1", "p-assis brasil.jpg", "s5-a"),
    creative("pequena1", "p-Matubo.png", "s5-b"),
    creative("pequena1", "p-Ótica Visão Sul.png", "s5-c"),
    creative("pequena1", "p-santana refrigeração.jpg", "s5-d"),
  ]),
  fallbackSlot(6, "Posição 3 - Direita", 8500, 3000, [
    creative("pequena2", "p-CATARINENSE MATERIAL DE CONSTRUÇÃO.jpg", "s6-a"),
    creative("pequena2", "p-FARMÁCIA MARYELL.jpg", "s6-b"),
    creative("pequena2", "p-Madecasa.jpg", "s6-c"),
    creative("pequena3", "p-AGROMEL.jpg", "s6-d"),
  ]),
];

export const leftAdSlots = [adSlots[0], adSlots[2], adSlots[4]];
export const rightAdSlots = [adSlots[1], adSlots[3], adSlots[5]];

export interface AdPlaylistMedia {
  id: string;
  imageUrl: string;
  href?: string;
  alt?: string;
  order: number;
}

export interface AdPlaylist {
  playlistId: string;
  slotId: string;
  media: AdPlaylistMedia[];
  activeFrom?: string;
  activeUntil?: string;
}
